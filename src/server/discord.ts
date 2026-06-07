/**
 * Discord webhook notifications - echotube-style
 */
import type { Video } from "../../schema/types";

const logger = {
  info: (msg: string) => console.log(`[discord] ${msg}`),
  error: (msg: string, err?: Error) => console.error(`[discord] ${msg}`, err?.message || ""),
};

export async function postVideo(webhookUrl: string, video: Video): Promise<void> {
  const embed = {
    title: video.title,
    url: video.url,
    color: 0xff0000, // YouTube red
    author: {
      name: video.channelName,
    },
    thumbnail: {
      url: video.thumbnail,
    },
    description: video.description.slice(0, 200),
  };

  const payload = {
    content: null,
    embeds: [embed],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    logger.info(`Posted: ${video.title}`);
  } catch (error) {
    logger.error("Failed to post", error as Error);
    throw error;
  }
}
