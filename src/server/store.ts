/**
 * OurTube Store - JSONL + bun:sqlite
 * Mirrors loadtest-dashboard pattern
 */
import { Database } from "bun:sqlite";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Channel, Video } from "../../schema/types";

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

// ── store ─────────────────────────────────────────────────────────────────

export class Store {
  db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  // ── channels ─────────────────────────────────────────────────────────────

  upsertChannel(channel: Channel): void {
    const existing = this.db
      .query("SELECT 1 FROM channels WHERE channel_id = ?")
      .get(channel.channelId);

    if (!existing) {
      // Append to JSONL
      const file = getChannelsFile();
      mkdirSync(dirname(file), { recursive: true });
      appendFileSync(file, JSON.stringify(channel) + "\n");
    }

    // Update SQLite
    this.db.query(
      `INSERT OR REPLACE INTO channels
       (channel_id, name, source, added_at, updated_via, updated_at, raw)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      channel.channelId,
      channel.name,
      channel.source,
      channel.addedAt,
      channel.updatedVia,
      channel.updatedAt,
      JSON.stringify(channel)
    );
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

  // ── videos ───────────────────────────────────────────────────────────────

  /** How many videos are stored for a channel. */
  countChannelVideos(channelId: string): number {
    return (
      this.db
        .query("SELECT COUNT(*) AS c FROM videos WHERE channel_id = ?")
        .get(channelId) as { c: number }
    ).c;
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

  getVideo(videoId: string): Video | null {
    const row = this.db
      .query("SELECT raw FROM videos WHERE video_id = ?")
      .get(videoId) as { raw: string } | undefined;
    return row ? (JSON.parse(row.raw) as Video) : null;
  }

  getVideos(opts: {
    unwatchedOnly?: boolean;
    channelId?: string;
    limit?: number;
    offset?: number;
  } = {}): { items: Video[]; totalCount: number } {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (opts.unwatchedOnly) {
      where.push("watched = 0");
    }
    if (opts.channelId) {
      where.push("channel_id = ?");
      params.push(opts.channelId);
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
  db.query(
    `INSERT OR REPLACE INTO channels
     (channel_id, name, source, added_at, updated_via, updated_at, raw)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    channel.channelId,
    channel.name,
    channel.source,
    channel.addedAt,
    channel.updatedVia,
    channel.updatedAt,
    JSON.stringify(channel)
  );
}

function insertOrReplaceVideo(db: Database, video: Video): void {
  db.query(
    `INSERT OR REPLACE INTO videos
     (video_id, title, channel_id, channel_name, published_at, thumbnail, description, url, fetched_at, watched, watched_at, raw)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    JSON.stringify(video)
  );
}

// ── boot ──────────────────────────────────────────────────────────────────

const SCHEMA = `
CREATE TABLE IF NOT EXISTS channels (
  channel_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  added_at TEXT NOT NULL,
  updated_via TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  raw TEXT NOT NULL
);

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
  raw TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS videos_published ON videos(published_at DESC);
CREATE INDEX IF NOT EXISTS videos_channel ON videos(channel_id);
CREATE INDEX IF NOT EXISTS videos_watched ON videos(watched);
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
      const channel = data as Channel;
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
