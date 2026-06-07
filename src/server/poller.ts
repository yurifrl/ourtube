/**
 * Background poller - fetches YouTube feeds
 */
import { fetchChannelVideos, fetchChannelAvatar } from "./youtube";
import { postVideo } from "./discord";
import { resolveGroupWebhooks } from "./webhooks";
import type { Store } from "./store";
import type { Video } from "../../schema/types";
import { normalizeGroup } from "../../schema/types";

const logger = {
  info: (msg: string) => console.log(`[poller] ${msg}`),
  debug: (msg: string) => console.log(`[poller] ${msg}`),
  error: (msg: string, err?: Error) => console.error(`[poller] ${msg}`, err?.message || ""),
};

export class Poller {
  store: Store;
  intervalMs: number;
  initialVideos: number;
  initialMaxAgeDays: number;
  timer: Timer | null = null;
  isRunning = false;

  constructor(
    store: Store,
    intervalSeconds = 300,
    initialVideos = 1,
    initialMaxAgeDays = 7,
  ) {
    this.store = store;
    this.intervalMs = intervalSeconds * 1000;
    this.initialVideos = Math.max(0, initialVideos);
    this.initialMaxAgeDays = Math.max(0, initialMaxAgeDays);
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info(`Starting poller (${this.intervalMs}ms interval)`);

    // Run immediately, then schedule
    this.tick();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    logger.info("Poller stopped");
  }

  async tick(): Promise<void> {
    logger.debug("Tick");
    const channels = this.store.getChannels();

    if (channels.length === 0) {
      logger.debug("No channels to poll");
      return;
    }

    const newVideos: Video[] = [];

    for (const channel of channels) {
      try {
        // Backfill missing avatar (once)
        if (!channel.avatar) {
          const avatar = await fetchChannelAvatar(channel.channelId);
          if (avatar) this.store.setChannelAvatar(channel.channelId, avatar);
        }

        const videos = await fetchChannelVideos(channel.channelId, channel.name);

        // First sight of a channel: surface only the latest N (config) videos
        // that are also recent enough (within initialMaxAgeDays). A rarely-
        // posting channel whose latest upload is old surfaces nothing. The rest
        // are suppressed as "seen" so they never flood the feed nor re-detect.
        const firstSight = this.store.isChannelUntracked(channel.channelId);
        const maxAgeMs = this.initialMaxAgeDays * 86400 * 1000;
        const now = Date.now();

        videos.forEach((video, idx) => {
          if (firstSight) {
            const tooOld =
              maxAgeMs > 0 &&
              now - new Date(video.publishedAt).getTime() > maxAgeMs;
            if (idx >= this.initialVideos || tooOld) {
              this.store.markSeen(video.videoId, channel.channelId);
              return;
            }
          }
          // already suppressed earlier → skip, never resurrect
          if (this.store.isSeen(video.videoId)) return;

          const { isNew } = this.store.upsertVideo(video);
          if (isNew) {
            newVideos.push(video);
            logger.info(`New video: ${video.title}`);
          }
        });
      } catch (error) {
        logger.error(`Failed to poll ${channel.name}`, error as Error);
      }
    }

    // Post to Discord, routed per group. A video belongs to exactly one group
    // (its channel's group), so each new video maps to a single group whose
    // webhooks are resolved from the environment by convention
    // (OT_WEBHOOK_URL_<GROUP> + _*). Multiple webhooks per group all fire.
    if (newVideos.length > 0) {
      // channelId -> group lookup for this batch
      const groupOf = new Map<string, string>();
      for (const c of this.store.getChannels()) {
        groupOf.set(c.channelId, normalizeGroup(c.group));
      }

      // Bucket new videos by group, capped at 5 per group per poll.
      const byGroup = new Map<string, Video[]>();
      for (const v of newVideos) {
        const g = groupOf.get(v.channelId) ?? normalizeGroup(undefined);
        const bucket = byGroup.get(g) ?? [];
        if (bucket.length < 5) bucket.push(v);
        byGroup.set(g, bucket);
      }

      for (const [group, vids] of byGroup) {
        const urls = resolveGroupWebhooks(group);
        if (urls.length === 0) {
          logger.debug(`No webhook env vars for group "${group}" — skipping ${vids.length} videos`);
          continue;
        }
        for (const video of vids) {
          for (const url of urls) {
            try {
              await postVideo(url, video);
              await new Promise((r) => setTimeout(r, 1000)); // Rate limit
            } catch (error) {
              logger.error("Discord post failed", error as Error);
            }
          }
        }
      }
    }

    logger.info(`Tick complete: ${newVideos.length} new videos`);
  }
}