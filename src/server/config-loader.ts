/**
 * Config loader - supports JSON, YAML, CSV
 */
import { existsSync, readFileSync } from "node:fs";
import type { Channel } from "../../schema/types";

const logger = {
  info: (msg: string) => console.log(`[config] ${msg}`),
  debug: (msg: string) => console.log(`[config] ${msg}`),
};

// Simple YAML parser for our use case
function parseYaml(text: string): Array<{ name?: string; channel_name?: string; channel_id?: string; channelId?: string }> {
  const lines = text.split("\n");
  const items: Array<Record<string, string>> = [];
  let current: Record<string, string> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("- ")) {
      if (current) items.push(current);
      current = {};
      const match = trimmed.match(/-\s*(\w+):\s*(.+)/);
      if (match) {
        current[match[1]] = match[2].trim();
      }
    } else if (current && trimmed.includes(":")) {
      const [key, ...valParts] = trimmed.split(":");
      current[key.trim()] = valParts.join(":").trim();
    }
  }

  if (current) items.push(current);
  return items;
}

// Simple CSV parser
function parseCsv(text: string): Array<{ name: string; channelId: string }> {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const nameIdx = headers.findIndex((h) => h === "channel_name" || h === "name");
  const idIdx = headers.findIndex((h) => h === "channel_id" || h === "channelid");

  if (nameIdx === -1 || idIdx === -1) {
    // No headers, assume: channel_id,name
    return lines.slice(1).map((line) => {
      const parts = line.split(",");
      return {
        channelId: parts[0]?.trim() || "",
        name: parts[1]?.trim() || "",
      };
    }).filter((c) => c.channelId && c.name);
  }

  return lines.slice(1).map((line) => {
    const parts = line.split(",");
    return {
      name: parts[nameIdx]?.trim() || "",
      channelId: parts[idIdx]?.trim() || "",
    };
  }).filter((c) => c.channelId && c.name);
}

export function loadConfigFile(path: string): Channel[] {
  if (!existsSync(path)) {
    logger.debug(`Config file not found: ${path}`);
    return [];
  }

  const text = readFileSync(path, "utf8");
  const ext = path.split(".").pop()?.toLowerCase();
  const now = new Date().toISOString();

  let rawData: Array<{ name?: string; channel_name?: string; channel_id?: string; channelId?: string }>;

  switch (ext) {
    case "json":
      rawData = JSON.parse(text);
      break;
    case "yaml":
    case "yml":
      rawData = parseYaml(text);
      break;
    case "csv":
      return parseCsv(text).map((c) => ({
        channelId: c.channelId,
        name: c.name,
        source: "config",
        addedAt: now,
        updatedVia: "config",
        updatedAt: now,
      }));
    default:
      throw new Error(`Unsupported config format: ${ext}`);
  }

  return rawData.map((c) => ({
    channelId: c.channel_id || c.channelId || "",
    name: c.channel_name || c.name || "",
    source: "config" as const,
    addedAt: now,
    updatedVia: "config" as const,
    updatedAt: now,
  })).filter((c) => c.channelId && c.name);
}

export function findConfigFile(basePath: string): string | null {
  const exts = ["json", "yaml", "yml", "csv"];
  for (const ext of exts) {
    const path = `${basePath}.${ext}`;
    if (existsSync(path)) {
      logger.info(`Found config: ${path}`);
      return path;
    }
  }
  return null;
}
