/**
 * Config loader - supports JSON, YAML, CSV
 */
import { existsSync, readFileSync } from "node:fs";
import type { Channel } from "../../schema/types";
import { normalizeGroup } from "../../schema/types";

const logger = {
  info: (msg: string) => console.log(`[config] ${msg}`),
  debug: (msg: string) => console.log(`[config] ${msg}`),
};

// Simple YAML parser for our use case
function parseYaml(text: string): Array<{ name?: string; channel_name?: string; channel_id?: string; channelId?: string; group?: string; channel_group?: string }> {
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
function parseCsv(text: string): Array<{ name: string; channelId: string; group: string }> {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const nameIdx = headers.findIndex((h) => h === "channel_name" || h === "name");
  const idIdx = headers.findIndex((h) => h === "channel_id" || h === "channelid");
  const groupIdx = headers.findIndex((h) => h === "group" || h === "channel_group");

  if (nameIdx === -1 || idIdx === -1) {
    // No headers, assume: channel_id,name
    return lines.slice(1).map((line) => {
      const parts = line.split(",");
      return {
        channelId: parts[0]?.trim() || "",
        name: parts[1]?.trim() || "",
        group: normalizeGroup(parts[2]?.trim()),
      };
    }).filter((c) => c.channelId && c.name);
  }

  return lines.slice(1).map((line) => {
    const parts = line.split(",");
    return {
      name: parts[nameIdx]?.trim() || "",
      channelId: parts[idIdx]?.trim() || "",
      group: normalizeGroup(groupIdx === -1 ? undefined : parts[groupIdx]?.trim()),
    };
  }).filter((c) => c.channelId && c.name);
}

export type LoadedConfig = { groups: string[]; channels: Channel[] };

function mapChannelRow(
  c: { name?: string; channel_name?: string; channel_id?: string; channelId?: string; group?: string; channel_group?: string },
  now: string,
): Channel {
  return {
    channelId: c.channel_id || c.channelId || "",
    name: c.channel_name || c.name || "",
    group: normalizeGroup(c.channel_group || c.group),
    source: "config" as const,
    addedAt: now,
    updatedVia: "config" as const,
    updatedAt: now,
  };
}

function extractGroupNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const names = raw
    .map((g) => (typeof g === "string" ? g : (g && typeof g === "object" ? (g as { name?: string }).name : "")))
    .map((n) => normalizeGroup(n))
    .filter(Boolean);
  return [...new Set(names)];
}

/**
 * Load groups + channels from a config file.
 *
 * JSON supports two shapes:
 *   - combined object: { groups: [{name}|"name"], channels: [...] }
 *   - legacy array:    [ ...channels ]  (groups derived as empty)
 * YAML/CSV are channels-only.
 */
export function loadConfig(path: string): LoadedConfig {
  if (!existsSync(path)) {
    logger.debug(`Config file not found: ${path}`);
    return { groups: [], channels: [] };
  }

  const text = readFileSync(path, "utf8");
  const ext = path.split(".").pop()?.toLowerCase();
  const now = new Date().toISOString();

  let groups: string[] = [];
  let rawChannels: Array<Record<string, string>>;

  switch (ext) {
    case "json": {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        rawChannels = parsed;
      } else {
        groups = extractGroupNames(parsed.groups);
        rawChannels = Array.isArray(parsed.channels) ? parsed.channels : [];
      }
      break;
    }
    case "yaml":
    case "yml":
      rawChannels = parseYaml(text);
      break;
    case "csv":
      rawChannels = parseCsv(text).map((c) => ({ channel_id: c.channelId, channel_name: c.name, group: c.group }));
      break;
    default:
      throw new Error(`Unsupported config format: ${ext}`);
  }

  const channels = rawChannels.map((c) => mapChannelRow(c, now)).filter((c) => c.channelId && c.name);
  return { groups, channels };
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
