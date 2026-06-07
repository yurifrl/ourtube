// Channel types
export type Channel = {
  channelId: string;
  name: string;
  avatar?: string;
  source: "config" | "ui";
  addedAt: string;
  updatedVia: "config" | "ui";
  updatedAt: string;
};

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
};

// App config
export type AppConfig = {
  port: number;
  pollIntervalSeconds: number;
  discordWebhookUrl?: string;
  storageDir: string;
  logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR";
};

// API response types
export type ApiResponse<T> = {
  data?: T;
  error?: string;
};
