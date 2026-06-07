/**
 * Bun HTTP server - API routes
 */
import { openStore, replayChannels, replayVideos, replaySeen } from "./store";
import { loadConfigFile, findConfigFile } from "./config-loader";
import { Poller } from "./poller";
import { fetchChannelVideos } from "./youtube";
import type { Store } from "./store";

const logger = {
  info: (msg: string) => console.log(`[api] ${msg}`),
  debug: (msg: string) => console.log(`[api] ${msg}`),
  error: (msg: string, err?: Error) => console.error(`[api] ${msg}`, err?.message || ""),
};

// Global state
let store: Store;
let poller: Poller;
let server: ReturnType<typeof Bun.serve>;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function notFound(): Response {
  return jsonResponse({ error: "Not found" }, 404);
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export function initApi(): ReturnType<typeof Bun.serve> {
  // Load store
  store = openStore();
  replayChannels(store);
  replayVideos(store);
  replaySeen(store);

  // Load config channels
  const configPath = process.env.OT_CONFIG_PATH || findConfigFile("./config/channels");
  if (configPath) {
    const configChannels = loadConfigFile(configPath);
    for (const c of configChannels) {
      // Only add if not exists
      if (!store.getChannel(c.channelId)) {
        store.upsertChannel(c);
        logger.info(`Added from config: ${c.name}`);
      }
    }
  }

  // Start poller
  const pollInterval = parseInt(process.env.OT_POLL_INTERVAL_SECONDS || "300");
  const discordUrl = process.env.OT_DISCORD_WEBHOOK_URL;
  // On first sight of a channel, surface only the latest N videos (default 1)
  // and only those newer than initialMaxAgeDays (default 7) so a channel's
  // historical backlog — or a stale latest upload — never floods the feed.
  const initialVideos = parseInt(process.env.OT_INITIAL_VIDEOS_PER_CHANNEL || "1");
  const initialMaxAgeDays = parseInt(process.env.OT_INITIAL_MAX_AGE_DAYS || "7");
  poller = new Poller(store, discordUrl, pollInterval, initialVideos, initialMaxAgeDays);
  poller.start();

  // Start server
  const port = parseInt(process.env.OT_PORT || "3000");
  server = Bun.serve({
    port,
    async fetch(req): Promise<Response> {
      const url = new URL(req.url);
      const path = url.pathname;
      const method = req.method;

      // CORS preflight
      if (method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }

      // Health
      if (path === "/api/health") {
        return jsonResponse({ status: "ok", channels: store.getStats().channels });
      }

      // Stats
      if (path === "/api/stats") {
        return jsonResponse(store.getStats());
      }

      // Channels
      if (path === "/api/channels") {
        if (method === "GET") {
          return jsonResponse({ channels: store.getChannels() });
        }
        if (method === "POST") {
          const body = await req.json();
          const channel = {
            channelId: body.channelId,
            name: body.name,
            source: "ui" as const,
            addedAt: new Date().toISOString(),
            updatedVia: "ui" as const,
            updatedAt: new Date().toISOString(),
          };
          store.upsertChannel(channel);
          
          // Immediate fetch
          fetchChannelVideos(channel.channelId, channel.name).then(videos => {
            for (const v of videos) store.upsertVideo(v);
          });
          
          return jsonResponse({ success: true }, 201);
        }
      }

      if (path.startsWith("/api/channels/")) {
        const channelId = path.split("/").pop()!;
        if (method === "DELETE") {
          store.removeChannel(channelId);
          return jsonResponse({ success: true });
        }
        if (method === "GET") {
          const channel = store.getChannel(channelId);
          return channel ? jsonResponse(channel) : notFound();
        }
      }

      // Videos
      if (path === "/api/videos") {
        const unwatchedOnly = url.searchParams.get("unwatched") === "1";
        const limit = parseInt(url.searchParams.get("limit") || "50");
        const offset = parseInt(url.searchParams.get("offset") || "0");
        const result = store.getVideos({ unwatchedOnly, limit, offset });
        return jsonResponse(result);
      }

      if (path.startsWith("/api/videos/") && path.includes("/watched")) {
        const videoId = path.split("/")[3];
        if (method === "POST") {
          const body = await req.json();
          store.markWatched(videoId, body.watched);
          return jsonResponse({ success: true });
        }
      }

      // Trigger manual poll
      if (path === "/api/poll") {
        if (method === "POST") {
          poller.tick();
          return jsonResponse({ success: true });
        }
      }

      // Static files (Vite build)
      const filePath = path === "/" ? "/index.html" : path;
      const staticPath = `./dist${filePath}`;
      const exists = await Bun.file(staticPath).exists();
      if (exists) {
        return new Response(Bun.file(staticPath));
      }

      // Fallback to index.html for SPA routes
      const indexHtml = await Bun.file("./dist/index.html").exists();
      if (indexHtml) {
        return new Response(Bun.file("./dist/index.html"));
      }

      return notFound();
    },
  });

  logger.info(`Server running on port ${port}`);
  return server;
}

export function shutdown(): void {
  logger.info("Shutting down...");
  poller?.stop();
  server?.stop();
}
