/**
 * Webhook resolution by env-var convention.
 *
 * A group's webhook URLs are NOT listed explicitly anywhere — they are
 * discovered from the environment by convention. For a group `G`, every env
 * var named `OT_WEBHOOK_URL_<SLUG>` or `OT_WEBHOOK_URL_<SLUG>_*` holds a
 * webhook URL that fires for that group (allowing multiple webhooks per group).
 *
 *   group "default"      -> OT_WEBHOOK_URL_DEFAULT, OT_WEBHOOK_URL_DEFAULT_2, ...
 *   group "gaming squad" -> OT_WEBHOOK_URL_GAMING_SQUAD, OT_WEBHOOK_URL_GAMING_SQUAD_BACKUP, ...
 */
import { normalizeGroup } from "../../schema/types";

const PREFIX = "OT_WEBHOOK_URL_";

/** Uppercase env-key slug for a group name (non-alphanumerics -> single _). */
export function groupSlug(group: string): string {
  return normalizeGroup(group)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Resolve all webhook URLs configured for a group via env convention. */
export function resolveGroupWebhooks(
  group: string,
  env: Record<string, string | undefined> = process.env,
): string[] {
  const slug = groupSlug(group);
  if (!slug) return [];
  const exact = `${PREFIX}${slug}`;
  const sub = `${exact}_`;
  const urls: string[] = [];
  for (const [key, val] of Object.entries(env)) {
    if (!val) continue;
    if (key === exact || key.startsWith(sub)) urls.push(val);
  }
  return urls;
}
