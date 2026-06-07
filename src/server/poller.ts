/**
 * Background poller - fetches YouTube feeds
 */
import { fetchChannelVideos, fetchChannelAvatar } from "./youtube";
import { postVideo } from "./discord";
import type { Store } from "./store";
import type { Video } from "../../schema/types";

const logger = {
  info: (msg: string) => console.log(`[poller] ${msg}`),
  debug: (msg: string) => console.log(`[poller] ${msg}`),
  error: (msg: string, err?: Error) => console.error(`[poller] ${msg}`, err?.message || ""),
};

export class Poller {
  store: Store;
  discordUrl?: string;
  intervalMs: number;
  initialVideos: number;
  timer: Timer | null = null;
  isRunning = false;

  constructor(
    store: Store,
    discordUrl?: string,
    intervalSeconds = 300,
    initialVideos = 1,
  ) {
    this.store = store;
    this.discordUrl = discordUrl;
    this.intervalMs = intervalSeconds * 1000;
    this.initialVideos = Math.max(0, initialVideos);
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

        // First sight of a channel: surface only the latest N (config), and
        // suppress the rest of its backlog as "seen" so it never floods the
        // feed AND never gets re-detected as new on a later poll.
        const firstSight = this.store.isChannelUntracked(channel.channelId);

        videos.forEach((video, idx) => {
          if (firstSight && idx >= this.initialVideos) {
            this.store.markSeen(video.videoId, channel.channelId);
            return;
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

    // Post to Discord
    if (this.discordUrl && newVideos.length > 0) {
      for (const video of newVideos.slice(0, 5)) { // Limit to 5 per poll
        try {
          await postVideo(this.discordUrl, video);
          await new Promise((r) => setTimeout(r, 1000)); // Rate limit
        } catch (error) {
          logger.error("Discord post failed", error as Error);
        }
      }
    }

    logger.info(`Tick complete: ${newVideos.length} new videos`);
  }
}