/**
 * OurTube Store - JSONL + bun:sqlite
 * Mirrors loadtest-dashboard pattern
 */
import { Database } from "bun:sqlite";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Channel, Video } from "../../schema/types";
import { normalizeGroup, DEFAULT_GROUP } from "../../schema/types";

const logger = {
  info: (msg: string) => console.log(`[store] ${msg}`),
  debug: (msg: string) => console.log(`[store] ${msg}`),
};

// ── paths ─────────────────────────────────────────────────────────────────

export function getStorageDir(): string {
  return process.env.OT_STORAGE_DIR || "./public/store";
}

export function getChannelsFile(): string {
  return join(getStorageDir(), "channels.jsonl");
}

export function getVideosFile(month: string): string {
  return join(getStorageDir(), "videos", `${month}.jsonl`);
}

export function getSeenFile(): string {
  return join(getStorageDir(), "seen.jsonl");
}

// ── store ─────────────────────────────────────────────────────────────────

export class Store {
  db: Database;
  /** Group names defined in config. Available groups = these ∪ DEFAULT_GROUP. */
  configuredGroups: string[] = [];

  constructor(db: Database) {
    this.db = db;
  }

  // ── channels ─────────────────────────────────────────────────────────────

  upsertChannel(channel: Channel): void {
    const group = normalizeGroup(channel.group);
    const normalized: Channel = { ...channel, group };
    const existing = this.db
      .query("SELECT 1 FROM channels WHERE channel_id = ?")
      .get(channel.channelId);

    if (!existing) {
      // Append to JSONL
      const file = getChannelsFile();
      mkdirSync(dirname(file), { recursive: true });
      appendFileSync(file, JSON.stringify(normalized) + "\n");
    }

    insertOrReplaceChannel(this.db, normalized);
  }

  removeChannel(channelId: string): void {
    // Append tombstone to JSONL
    const tombstone = { channelId, _deleted: true, updatedAt: new Date().toISOString() };
    const file = getChannelsFile();
    appendFileSync(file, JSON.stringify(tombstone) + "\n");

    // Remove from SQLite
    this.db.query("DELETE FROM channels WHERE channel_id = ?").run(channelId);
  }

  /** Update a channel's cached avatar URL (persists to JSONL). */
  setChannelAvatar(channelId: string, avatar: string): void {
    const channel = this.getChannel(channelId);
    if (!channel || channel.avatar === avatar) return;
    const updated = { ...channel, avatar };
    const file = getChannelsFile();
    appendFileSync(file, JSON.stringify(updated) + "\n");
    this.db.query("UPDATE channels SET raw = ? WHERE channel_id = ?").run(
      JSON.stringify(updated),
      channelId
    );
  }

  /** Move a channel to another group (persists to JSONL). Returns false if unknown. */
  setChannelGroup(channelId: string, group: string): boolean {
    const channel = this.getChannel(channelId);
    if (!channel) return false;
    const normalized = normalizeGroup(group);
    const updated: Channel = { ...channel, group: normalized, updatedVia: "ui", updatedAt: new Date().toISOString() };
    appendFileSync(getChannelsFile(), JSON.stringify(updated) + "\n");
    insertOrReplaceChannel(this.db, updated);
    return true;
  }

  /** Set the config-defined group list (drives the UI's selectable groups). */
  setConfiguredGroups(names: string[]): void {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const n of names) {
      const g = normalizeGroup(n);
      if (!seen.has(g)) { seen.add(g); out.push(g); }
    }
    this.configuredGroups = out;
  }

  /** Channel count per group, from the channels table. */
  private groupCounts(): Map<string, number> {
    const rows = this.db
      .query("SELECT \"group\" AS g, COUNT(*) AS c FROM channels GROUP BY \"group\"")
      .all() as { g: string; c: number }[];
    return new Map(rows.map((r) => [r.g, r.c]));
  }

  /**
   * Available groups with channel counts. The set is exactly the config-defined
   * groups plus DEFAULT_GROUP (always present) — groups are NOT collected from
   * channel usage. Ordered by name.
   */
  getGroups(): { group: string; count: number }[] {
    const counts = this.groupCounts();
    const names = new Set<string>([DEFAULT_GROUP, ...this.configuredGroups]);
    return [...names]
      .sort()
      .map((group) => ({ group, count: counts.get(group) ?? 0 }));
  }

  getChannels(): Channel[] {
    const rows = this.db
      .query("SELECT raw FROM channels ORDER BY name")
      .all() as { raw: string }[];
    return rows.map((r) => JSON.parse(r.raw) as Channel);
  }

  getChannel(channelId: string): Channel | null {
    const row = this.db
      .query("SELECT raw FROM channels WHERE channel_id = ?")
      .get(channelId) as { raw: string } | undefined;
    return row ? (JSON.parse(row.raw) as Channel) : null;
  }

  // ── seen markers ─────────────────────────────────────────────────────────
  // Lightweight "we already know this video, never surface it" set. Used for a
  // channel's pre-existing backlog on first sight so it never floods the feed,
  // while still preventing it from being re-detected as new on later polls.

  isSeen(videoId: string): boolean {
    return !!this.db
      .query("SELECT 1 FROM seen WHERE video_id = ?")
      .get(videoId);
  }

  markSeen(videoId: string, channelId: string): void {
    if (this.isSeen(videoId)) return;
    appendFileSync(getSeenFile(), JSON.stringify({ videoId, channelId }) + "\n");
    this.db
      .query("INSERT OR IGNORE INTO seen (video_id, channel_id) VALUES (?, ?)")
      .run(videoId, channelId);
  }

  loadSeenFromReplay(videoId: string, channelId: string): void {
    this.db
      .query("INSERT OR IGNORE INTO seen (video_id, channel_id) VALUES (?, ?)")
      .run(videoId, channelId);
  }

  // ── videos ───────────────────────────────────────────────────────────────

  /** How many videos are stored for a channel. */
  countChannelVideos(channelId: string): number {
    return (
      this.db
        .query("SELECT COUNT(*) AS c FROM videos WHERE channel_id = ?")
        .get(channelId) as { c: number }
    ).c;
  }

  /**
   * First sight of a channel = we've stored neither a feed video nor a seen
   * marker for it. On first sight we surface only the latest N and suppress the
   * rest, so the historical backlog never floods the feed.
   */
  isChannelUntracked(channelId: string): boolean {
    if (this.countChannelVideos(channelId) > 0) return false;
    const seen = (
      this.db
        .query("SELECT COUNT(*) AS c FROM seen WHERE channel_id = ?")
        .get(channelId) as { c: number }
    ).c;
    return seen === 0;
  }

  upsertVideo(video: Video): { isNew: boolean } {
    const existing = this.db
      .query("SELECT 1 FROM videos WHERE video_id = ?")
      .get(video.videoId);

    // Only persist brand-new videos. An already-known video keeps its stored
    // state (notably `watched`) — re-polling must never clobber or resurrect it.
    if (existing) {
      return { isNew: false };
    }

    const month = video.publishedAt.slice(0, 7);
    const file = getVideosFile(month);
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, JSON.stringify(video) + "\n");

    insertOrReplaceVideo(this.db, video);

    return { isNew: true };
  }

  markWatched(videoId: string, watched: boolean): void {
    const video = this.getVideo(videoId);
    if (!video) return;

    const updated: Video = {
      ...video,
      watched,
      watchedAt: watched ? new Date().toISOString() : undefined,
    };

    // Append update to JSONL
    const month = video.publishedAt.slice(0, 7);
    const file = getVideosFile(month);
    appendFileSync(file, JSON.stringify(updated) + "\n");

    // Update SQLite (including the raw JSON the read-side returns)
    this.db.query(
      "UPDATE videos SET watched = ?, watched_at = ?, raw = ? WHERE video_id = ?"
    ).run(
      watched ? 1 : 0,
      updated.watchedAt ? Date.parse(updated.watchedAt) : null,
      JSON.stringify(updated),
      videoId
    );
  }

  /** Add/remove a video from the Watch Later queue (persists to JSONL). */
  setWatchLater(videoId: string, watchLater: boolean): void {
    const video = this.getVideo(videoId);
    if (!video) return;

    const updated: Video = {
      ...video,
      watchLater,
      watchLaterAt: watchLater ? new Date().toISOString() : undefined,
    };

    const month = video.publishedAt.slice(0, 7);
    appendFileSync(getVideosFile(month), JSON.stringify(updated) + "\n");

    this.db.query(
      "UPDATE videos SET watch_later = ?, watch_later_at = ?, raw = ? WHERE video_id = ?"
    ).run(
      watchLater ? 1 : 0,
      updated.watchLaterAt ? Date.parse(updated.watchLaterAt) : null,
      JSON.stringify(updated),
      videoId
    );
  }

  getVideo(videoId: string): Video | null {
    const row = this.db
      .query("SELECT raw FROM videos WHERE video_id = ?")
      .get(videoId) as { raw: string } | undefined;
    return row ? (JSON.parse(row.raw) as Video) : null;
  }

  getVideos(opts: {
    unwatchedOnly?: boolean;
    watchLaterOnly?: boolean;
    channelId?: string;
    group?: string;
    limit?: number;
    offset?: number;
  } = {}): { items: Video[]; totalCount: number } {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (opts.unwatchedOnly) {
      where.push("watched = 0");
    }
    if (opts.watchLaterOnly) {
      where.push("watch_later = 1");
    }
    if (opts.channelId) {
      where.push("channel_id = ?");
      params.push(opts.channelId);
    }
    if (opts.group) {
      where.push('channel_id IN (SELECT channel_id FROM channels WHERE "group" = ?)');
      params.push(normalizeGroup(opts.group));
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const totalCount = (
      this.db.query(`SELECT COUNT(*) AS c FROM videos ${whereSql}`).get(...params as (string | number)[]) as { c: number }
    ).c;

    const limit = Math.min(500, Math.max(1, opts.limit ?? 50));
    const offset = Math.max(0, opts.offset ?? 0);

    const rows = this.db
      .query(`SELECT raw FROM videos ${whereSql} ORDER BY published_at DESC LIMIT ? OFFSET ?`)
      .all(...[...params, limit, offset] as (string | number)[]) as { raw: string }[];

    const items = rows.map((r) => JSON.parse(r.raw) as Video);
    return { items, totalCount };
  }

  // ── stats ────────────────────────────────────────────────────────────────

  getStats(): { channels: number; videos: number; unwatched: number } {
    const channels = (this.db.query("SELECT COUNT(*) AS c FROM channels").get() as { c: number }).c;
    const videos = (this.db.query("SELECT COUNT(*) AS c FROM videos").get() as { c: number }).c;
    const unwatched = (this.db.query("SELECT COUNT(*) AS c FROM videos WHERE watched = 0").get() as { c: number }).c;
    return { channels, videos, unwatched };
  }
}

// ── helpers ───────────────────────────────────────────────────────────────

function insertOrReplaceChannel(db: Database, channel: Channel): void {
  const group = normalizeGroup(channel.group);
  db.query(
    `INSERT OR REPLACE INTO channels
     (channel_id, name, "group", source, added_at, updated_via, updated_at, raw)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    channel.channelId,
    channel.name,
    group,
    channel.source,
    channel.addedAt,
    channel.updatedVia,
    channel.updatedAt,
    JSON.stringify({ ...channel, group })
  );
}

function insertOrReplaceVideo(db: Database, video: Video): void {
  db.query(
    `INSERT OR REPLACE INTO videos
     (video_id, title, channel_id, channel_name, published_at, thumbnail, description, url, fetched_at, watched, watched_at, watch_later, watch_later_at, raw)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    video.videoId,
    video.title,
    video.channelId,
    video.channelName,
    Date.parse(video.publishedAt),
    video.thumbnail,
    video.description,
    video.url,
    Date.parse(video.fetchedAt),
    video.watched ? 1 : 0,
    video.watchedAt ? Date.parse(video.watchedAt) : null,
    video.watchLater ? 1 : 0,
    video.watchLaterAt ? Date.parse(video.watchLaterAt) : null,
    JSON.stringify(video)
  );
}

// ── boot ──────────────────────────────────────────────────────────────────

const SCHEMA = `
CREATE TABLE IF NOT EXISTS channels (
  channel_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  "group" TEXT NOT NULL DEFAULT 'default',
  source TEXT NOT NULL,
  added_at TEXT NOT NULL,
  updated_via TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  raw TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS channels_group ON channels("group");

CREATE TABLE IF NOT EXISTS videos (
  video_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  published_at INTEGER NOT NULL,
  thumbnail TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  watched INTEGER NOT NULL DEFAULT 0,
  watched_at INTEGER,
  watch_later INTEGER NOT NULL DEFAULT 0,
  watch_later_at INTEGER,
  raw TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS videos_published ON videos(published_at DESC);
CREATE INDEX IF NOT EXISTS videos_channel ON videos(channel_id);
CREATE INDEX IF NOT EXISTS videos_watched ON videos(watched);
CREATE INDEX IF NOT EXISTS videos_watch_later ON videos(watch_later);

CREATE TABLE IF NOT EXISTS seen (
  video_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS seen_channel ON seen(channel_id);
`;

export function openStore(): Store {
  const db = new Database(":memory:");
  db.exec(SCHEMA);
  const store = new Store(db);
  logger.info("SQLite store initialized");
  return store;
}

// ── replay ─────────────────────────────────────────────────────────────────

export function replayChannels(store: Store): void {
  const file = getChannelsFile();
  if (!existsSync(file)) {
    logger.debug("No channels.jsonl to replay");
    return;
  }

  const text = readFileSync(file, "utf8");
  const seen = new Set<string>();
  let lines = 0;

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const data = JSON.parse(line);
      if (data._deleted) {
        seen.delete(data.channelId);
        continue;
      }
      if (!data.channelId || !data.name) continue;
      const channel = { ...data, group: normalizeGroup(data.group) } as Channel;
      store.db.query("DELETE FROM channels WHERE channel_id = ?").run(channel.channelId);
      insertOrReplaceChannel(store.db, channel);
      seen.add(channel.channelId);
      lines++;
    } catch {
      // tolerate bad lines
    }
  }

  logger.info(`Replayed ${lines} channel lines → ${seen.size} channels`);
}

export function replayVideos(store: Store): void {
  const dir = join(getStorageDir(), "videos");
  if (!existsSync(dir)) {
    logger.debug("No videos directory to replay");
    return;
  }

  // Get all month files sorted
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .sort();

  let lines = 0;

  for (const f of files) {
    const text = readFileSync(join(dir, f), "utf8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const video = JSON.parse(line) as Video;
        if (!video.videoId) continue;
        insertOrReplaceVideo(store.db, video);
        lines++;
      } catch {
        // tolerate bad lines
      }
    }
  }

  const { videos } = store.getStats();
  logger.info(`Replayed ${lines} video lines → ${videos} unique videos`);
}

export function replaySeen(store: Store): void {
  const file = getSeenFile();
  if (!existsSync(file)) {
    logger.debug("No seen.jsonl to replay");
    return;
  }
  const text = readFileSync(file, "utf8");
  let lines = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const { videoId, channelId } = JSON.parse(line);
      if (!videoId || !channelId) continue;
      store.loadSeenFromReplay(videoId, channelId);
      lines++;
    } catch {
      // tolerate bad lines
    }
  }
  logger.info(`Replayed ${lines} seen markers`);
}
