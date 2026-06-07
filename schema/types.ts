// Channel types
export type Channel = {
  channelId: string;
  name: string;
  avatar?: string;
  /** Group the channel belongs to. Absent param resolves to "default". */
  group: string;
  source: "config" | "ui";
  addedAt: string;
  updatedVia: "config" | "ui";
  updatedAt: string;
};

/** Fallback group bucket. "default" is a real group, not a null state. */
export const DEFAULT_GROUP = "default";

/** Normalize a raw group value (trim + lowercase); empty => DEFAULT_GROUP. */
export function normalizeGroup(raw?: string | null): string {
  const g = (raw ?? "").trim().toLowerCase();
  return g || DEFAULT_GROUP;
}

// Video types
export type Video = {
  videoId: string;
  title: string;
  channelId: string;
  channelName: string;
  publishedAt: string;
  thumbnail: string;
  description: string;
  url: string;
  fetchedAt: string;
  watched: boolean;
  watchedAt?: string;
  /** Saved to the Watch Later queue. Independent of `watched`. */
  watchLater?: boolean;
  watchLaterAt?: string;
};

// App config
export type AppConfig = {
  port: number;
  pollIntervalSeconds: number;
  storageDir: string;
  logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR";
  /** Enable inline YouTube iframe playback in the feed (env OT_EMBED_VIDEOS). */
  embedVideos: boolean;
};

// API response types
export type ApiResponse<T> = {
  data?: T;
  error?: string;
};
