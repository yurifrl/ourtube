/**
 * YouTube RSS feed fetching - echotube-style
 * Uses YouTube's public RSS feeds (no API key)
 */
import type { Video } from "../../schema/types";

const YOUTUBE_RSS_BASE = "https://www.youtube.com/feeds/videos.xml";
const logger = {
  debug: (msg: string, ...args: unknown[]) => console.log(`[youtube] ${msg}`, ...args),
  error: (msg: string, err?: Error) => console.error(`[youtube] ${msg}`, err?.message || ""),
};

export function getChannelFeedUrl(channelId: string): string {
  return `${YOUTUBE_RSS_BASE}?channel_id=${channelId}`;
}

export async function fetchChannelVideos(channelId: string, channelName: string): Promise<Video[]> {
  const url = getChannelFeedUrl(channelId);
  logger.debug(`Fetching ${url}`);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "OurTube/1.0.0 (RSS Feed Reader)",
        "Accept": "application/rss+xml, application/xml, text/xml",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const xmlText = await response.text();
    return parseRSSFeed(xmlText, channelId, channelName);
  } catch (error) {
    logger.error(`Failed to fetch channel ${channelId}`, error as Error);
    throw error;
  }
}

function parseRSSFeed(xmlText: string, channelId: string, channelName: string): Video[] {
  const videos: Video[] = [];
  const now = new Date().toISOString();

  const entryRegex = /<entry\b[^>]*>([\s\S]*?)<\/entry>/g;
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(xmlText)) !== null) {
    const entry = match[1];

    const videoId =
      extractTag(entry, "yt:videoId") ||
      extractVideoIdFromUrl(extractAttr(entry, "link", "href"));
    const title = extractTag(entry, "title");
    const publishedAt = extractTag(entry, "published") || now;
    const description = extractTag(entry, "media:description") || "";
    const thumbnail = extractAttr(entry, "media:thumbnail", "url");

    if (!videoId || !title) continue;

    videos.push({
      videoId,
      title: decodeHtmlEntities(title),
      channelId,
      channelName,
      publishedAt,
      thumbnail: thumbnail || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      description: decodeHtmlEntities(description).slice(0, 200),
      url: `https://www.youtube.com/watch?v=${videoId}`,
      fetchedAt: now,
      watched: false,
    });
  }

  logger.debug(`Parsed ${videos.length} videos from ${channelName}`);
  return videos.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

function extractTag(xml: string, tagName: string): string | null {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i");
  const match = xml.match(regex);
  return match?.[1]?.trim() || null;
}

function extractAttr(xml: string, tagName: string, attr: string): string | null {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`<${escaped}\\b[^>]*\\b${attr}="([^"]*)"`, "i");
  const match = xml.match(regex);
  return match?.[1] || null;
}

function extractVideoIdFromUrl(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/[?&]v=([^&]+)/);
  return match?.[1] || null;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Fetch a channel's avatar (og:image) from its public page.
 * No API key needed - scrapes the meta tag.
 */
export async function fetchChannelAvatar(channelId: string): Promise<string | null> {
  try {
    const response = await fetch(`https://www.youtube.com/channel/${channelId}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!response.ok) return null;
    const html = await response.text();

    const ogMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
    if (ogMatch?.[1]) return ogMatch[1];

    const avatarMatch = html.match(/"avatar":\{"thumbnails":\[\{"url":"([^"]+)"/);
    if (avatarMatch?.[1]) return avatarMatch[1].replace(/\\u003d/g, "=");

    return null;
  } catch (error) {
    logger.error(`Failed to fetch avatar for ${channelId}`, error as Error);
    return null;
  }
}
