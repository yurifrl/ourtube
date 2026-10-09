# OurTube — Design Doc

A v2 of a self-hosted personal YouTube subscription feed. Subscribe to channels, poll
their **public RSS feeds** (no API key), collect new uploads into one clean
"unwatched" feed, and optionally fan new uploads out to Discord.

This document describes how to build OurTube from scratch — the shape it should
take if implemented again.

## Goals

- One feed of new uploads across many channels, marked read as you view them.
- Zero YouTube API keys, zero OAuth. Public RSS + light HTML scraping only.
- Own your data: plain append-only files on disk, no external DB service.
- Deployable as a single container; config-as-code for the channel list.
- Optional Discord notifications, routed per channel group.

## Non-goals

- No comments, likes, search, recommendations, or account sync.
- No transcoding or hosting of video — playback is the YouTube embed.
- No multi-user auth. It's a personal app behind your own ingress.

## Architecture

```
YouTube RSS ──poll──> Poller ──> Store ──> /api ──> SPA
                         └──new videos──> Discord webhooks (per group)
```

### Storage

Use the storage the other modules use, read the dir check how they do, probably will use a new table in pg db

Files under `OT_STORAGE_DIR`:

Heres the description on how the old architeture was using jsonl files, this is just for context

- `channels.jsonl` — one line per channel upsert; soft-delete = a later line
  with `deleted:true`; hard tombstone = `{channelId,_deleted:true}`.
- `videos/<YYYY-MM>.jsonl` — one line per video insert/update, partitioned by
  publish month. `watched`/`watchLater` changes append a new full record.
- `seen.jsonl` — lightweight "known, never surface" markers (backlog suppression).
- `purged.jsonl` — tombstones for retention-purged videos; a tombstone wins
  over any month-file record on replay.

Replay rules: last-write-wins per id; tombstones and `_deleted` remove; bad
lines are tolerated and skipped. SQLite schema is created fresh each boot.

> Trade-off: the whole log is replayed into memory at start. Fine for a
> personal feed (thousands of videos). If it ever grows large, partition or
> snapshot — but not before.

### The poller

Runs immediately on boot, then every `OT_POLL_INTERVAL_SECONDS` (default 300).
Per tick, for each non-deleted channel:

1. Backfill the channel avatar once (scrape `og:image` from the channel page).
2. Fetch the RSS feed, parse entries into `Video` records.
3. **First-sight throttle** — if the channel has no stored videos and no seen
   markers, surface only the latest `OT_INITIAL_VIDEOS_PER_CHANNEL` (default 1)
   uploads that are also newer than `OT_INITIAL_MAX_AGE_DAYS` (default 7); mark
   the rest `seen` so a backlog never floods the feed and is never re-detected.
4. Otherwise, skip already-`seen` and already-stored videos; insert genuinely
   new ones and collect them for notification.
5. Bucket new videos by their channel's group, cap 5/group/tick, and POST each
   to every webhook resolved for that group (1s spacing to respect rate limits).
6. Retention sweep: purge videos older than `OT_RETENTION_DAYS` (Watch Later
   exempt), writing tombstones.

### Groups and webhook routing by convention

A channel belongs to exactly one group (default: `"default"`). Group names are
normalized (trim + lowercase). Available groups = config-defined groups ∪
`default`.

Discord webhooks are **not** listed anywhere — they're discovered from the
environment by convention. For group `G` (slug = uppercased, non-alphanumerics
→ `_`), every env var named `OT_WEBHOOK_URL_<SLUG>` or `OT_WEBHOOK_URL_<SLUG>_*`
is a webhook that fires for that group. This lets you add/rotate webhooks with
zero code and support multiple per group.

### Feed UX: dwell-based read marking

Videos aren't marked read by an explicit click. A card marks itself watched
when it has been continuously on-screen (IntersectionObserver, ~1.8s) or
hovered (~2.5s) — the Feedly/NetNewsWire rule. Starting inline playback also
marks it. A guard prevents double-firing. Watched videos stay in the feed; they
just lose the "new" glow. **Watch Later** is a separate bookmark flag,
independent of watched, exposed as a virtual filter.

## Data model

Example from v1

```ts
type Channel = {
  channelId; name; avatar?; group;
  source: "config" | "ui"; addedAt; updatedVia; updatedAt;
  deleted?; deletedAt?;   // soft delete
};

type Video = {
  videoId; title; channelId; channelName; publishedAt; thumbnail;
  description; url; fetchedAt;
  watched; watchedAt?;
  watchLater?; watchLaterAt?;
};
```

## API

All JSON, CORS-open (personal app). SPA fallback for non-`/api` paths.

- `GET  /api/health` · `GET /api/stats`
- `GET  /api/config` — client flags (`embedVideos`, `retentionDays`)
- `GET  /api/groups` — groups with channel + unwatched counts, plus totals
- `GET/POST /api/channels`, `GET/DELETE /api/channels/:id`,
  `POST /api/channels/:id/group`, `POST /api/channels/:id/restore`
- `GET  /api/videos?unwatched=&watchlater=&group=&limit=&offset=`
- `POST /api/videos/mark-all-watched`
- `POST /api/videos/:id/watched`, `POST /api/videos/:id/watchlater`
- `POST /api/poll` — trigger a manual tick

## Config

- **Channel list**: `config/channels.{json,yaml,csv}` (path via `OT_CONFIG_PATH`,
  else auto-discovered). JSON shape: `{ groups:[{name}|"name"], channels:[...] }`.
  Config channels merge with UI-added ones; UI edits win on conflict.
- **Env**: `OT_PORT`, `OT_POLL_INTERVAL_SECONDS`, `OT_STORAGE_DIR`,
  `OT_CONFIG_PATH`, `OT_EMBED_VIDEOS`, `OT_INITIAL_VIDEOS_PER_CHANNEL`,
  `OT_INITIAL_MAX_AGE_DAYS`, `OT_RETENTION_DAYS`, `OT_WEBHOOK_URL_<GROUP>[_*]`.


Postgres is used for transient state like videos, watched etc, the channels are configured in a file that is a configmap


---

Core idea is to use this to consolidate how we deploy this app, web version the api and the front, its important that u integrate this with the other modules, find ways to integrate, change other modules, dont be limited to this one, if u find oportunity to consolidate a idea or bridge a concept gap do it, refactor other things, don't lock yourself in just this
