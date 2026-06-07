import { useEffect, useRef, useState, useCallback } from "react";
import { Video, LayoutGrid, Square, Bookmark } from "lucide-react";
import { cn, fmtRelative, fmtDate } from "../lib/utils";
import type { Video as VideoType, Channel } from "../../schema/types";

type ViewMode = "grid" | "single";

export function Home() {
  const [videos, setVideos] = useState<VideoType[]>([]);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [groups, setGroups] = useState<{ group: string; count: number; newCount?: number }[]>([]);
  const [totalNew, setTotalNew] = useState<number>(0);
  const [watchLaterNew, setWatchLaterNew] = useState<number>(0);
  // Single-select feed filter. Special values: "all" and "watchlater"
  // (a virtual group, never used for webhook routing); anything else is a
  // real channel group. Persisted to localStorage (ot:filter).
  const [filter, setFilterState] = useState<string>(
    () => localStorage.getItem("ot:filter") || "all"
  );
  const setFilter = useCallback((value: string) => {
    setFilterState(value);
    localStorage.setItem("ot:filter", value);
    // Jump back to the top so the freshly-loaded entries for the selected
    // filter are visible instead of staying scrolled down from the prior list.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const [loading, setLoading] = useState(true);
  const [embedVideos, setEmbedVideos] = useState(true);
  const [view, setView] = useState<ViewMode>(
    () => (localStorage.getItem("ot:view") as ViewMode) || "grid"
  );

  const watchLaterOnly = filter === "watchlater";

  const fetchVideos = useCallback(async () => {
    // fetch ALL videos — watched ones stay in the feed, they just lose the glow
    const params = new URLSearchParams({ limit: "500" });
    if (filter === "watchlater") params.set("watchlater", "1");
    else if (filter !== "all") params.set("group", filter);
    const res = await fetch(`/api/videos?${params}`);
    const data = await res.json();
    setVideos(data.items || []);
    setLoading(false);
  }, [filter]);

  const fetchAvatars = useCallback(async () => {
    const res = await fetch(`/api/channels`);
    const data = await res.json();
    const map: Record<string, string> = {};
    (data.channels || []).forEach((c: Channel) => {
      if (c.avatar) map[c.channelId] = c.avatar;
    });
    setAvatars(map);
  }, []);

  const fetchGroups = useCallback(async () => {
    const res = await fetch(`/api/groups`);
    const data = await res.json();
    const loaded: { group: string; count: number; newCount?: number }[] = data.groups || [];
    setGroups(loaded);
    setTotalNew(data.totalNew ?? 0);
    setWatchLaterNew(data.watchLaterNew ?? 0);
    // Staleness guard: a persisted group filter that no longer exists falls
    // back to "all". Valid persisted selections are left untouched.
    setFilterState((cur) => {
      if (cur === "all" || cur === "watchlater") return cur;
      if (loaded.some((g) => g.group === cur)) return cur;
      localStorage.setItem("ot:filter", "all");
      return "all";
    });
  }, []);

  const fetchConfig = useCallback(async () => {
    const res = await fetch(`/api/config`);
    const data = await res.json();
    setEmbedVideos(data.embedVideos !== false);
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  useEffect(() => {
    fetchAvatars();
    fetchGroups();
    fetchConfig();
  }, [fetchAvatars, fetchGroups, fetchConfig]);

  const setViewMode = (mode: ViewMode) => {
    setView(mode);
    localStorage.setItem("ot:view", mode);
  };

  const markWatched = useCallback(async (videoId: string) => {
    // flip to watched in place — the card stays, only the glow goes away
    setVideos((prev) =>
      prev.map((v) => (v.videoId === videoId ? { ...v, watched: true } : v))
    );
    await fetch(`/api/videos/${videoId}/watched`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watched: true }),
    });
    // tell the header to refresh the "new" count
    window.dispatchEvent(new Event("ot:feedchanged"));
  }, []);

  const toggleWatchLater = useCallback(async (videoId: string, value: boolean) => {
    setVideos((prev) =>
      prev
        .map((v) => (v.videoId === videoId ? { ...v, watchLater: value } : v))
        // if we're in the Watch Later view, drop a video that was just removed
        .filter((v) => !(watchLaterOnly && v.videoId === videoId && !value))
    );
    await fetch(`/api/videos/${videoId}/watchlater`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
  }, [watchLaterOnly]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="flex items-center gap-2 text-ink-400">
          <Video size={16} className="animate-breathe" />
          <span className="text-sm">loading videos...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* group filter — Watch Later is a virtual group alongside All + real groups */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <FilterChip label="All" active={filter === "all"} onClick={() => setFilter("all")} title={`${totalNew} new`} />
          {groups
            .filter((g) => g.count > 0)
            .map((g) => (
              <FilterChip
                key={g.group}
                label={g.group}
                active={filter === g.group}
                onClick={() => setFilter(g.group)}
                title={`${g.newCount ?? 0} new`}
              />
            ))}
          <FilterChip
            label="Watch Later"
            icon={<Bookmark size={12} />}
            active={filter === "watchlater"}
            onClick={() => setFilter("watchlater")}
            title={`${watchLaterNew} new`}
          />
        </div>

        <div className="flex items-center gap-1 bg-white/[0.025] ring-1 ring-white/5 rounded-xl p-1">
          <button
            onClick={() => setViewMode("grid")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors",
              view === "grid"
                ? "text-ink-950 bg-accent shadow-glow"
                : "text-ink-300 hover:text-ink-100 hover:bg-white/[0.04]"
            )}
            title="Grid view"
          >
            <LayoutGrid size={14} /> Grid
          </button>
          <button
            onClick={() => setViewMode("single")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-colors",
              view === "single"
                ? "text-ink-950 bg-accent shadow-glow"
                : "text-ink-300 hover:text-ink-100 hover:bg-white/[0.04]"
            )}
            title="Single view"
          >
            <Square size={14} /> Single
          </button>
        </div>
      </div>

      {videos.length === 0 ? (
        <div className="card">
          <div className="card-body">
            <div className="text-center py-20 text-ink-400">
              <Video size={32} className="mx-auto mb-3 opacity-30" />
              {watchLaterOnly ? "Nothing saved for later." : "No videos yet."}
            </div>
          </div>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map((video) => (
            <VideoCard
              key={video.videoId}
              video={video}
              avatar={avatars[video.channelId]}
              embedVideos={embedVideos}
              onSeen={() => markWatched(video.videoId)}
              onWatchLater={() => toggleWatchLater(video.videoId, !video.watchLater)}
            />
          ))}
        </div>
      ) : (
        <div className="max-w-2xl mx-auto flex flex-col gap-8">
          {videos.map((video) => (
            <VideoCard
              key={video.videoId}
              video={video}
              avatar={avatars[video.channelId]}
              embedVideos={embedVideos}
              onSeen={() => markWatched(video.videoId)}
              onWatchLater={() => toggleWatchLater(video.videoId, !video.watchLater)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick, icon, title }: { label: string; active: boolean; onClick: () => void; icon?: React.ReactNode; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium transition-colors",
        active
          ? "text-ink-950 bg-accent shadow-glow"
          : "text-ink-300 bg-white/[0.04] hover:text-ink-100 hover:bg-white/[0.08]"
      )}
    >
      {icon}{label}
    </button>
  );
}

interface VideoCardProps {
  video: VideoType;
  avatar?: string;
  embedVideos: boolean;
  onSeen: () => void;
  onWatchLater: () => void;
}

// How long a card must stay continuously visible / hovered before it counts
// as viewed. Visible-dwell mirrors the established RSS/news-reader rule
// (Feedly, NetNewsWire, Google Reader): mark read once an item has been
// sufficiently on-screen for a short continuous dwell, firing on the timer
// rather than on scroll-out. This avoids fast-scroll flybys yet is
// predictable — if you can read it, it's marked. Hover-dwell is the
// pointer-driven equivalent for users who linger with the mouse.
const VISIBLE_DWELL_MS = 1800;
const HOVER_DWELL_MS = 2500;

function VideoCard({ video, avatar, embedVideos, onSeen, onWatchLater }: VideoCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const visibleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guard so neither timer, hover, nor inline play can double-fire onSeen.
  const seenFired = useRef(false);
  const [playing, setPlaying] = useState(false);

  const isNew = !video.watched;

  const fireSeen = useCallback(() => {
    if (seenFired.current) return;
    seenFired.current = true;
    onSeen();
  }, [onSeen]);

  // Begin inline playback: swap to the iframe and mark the video watched so
  // the "new" glow/count stay consistent.
  const startPlaying = useCallback(() => {
    setPlaying(true);
    fireSeen();
  }, [fireSeen]);

  // Visible-dwell: fire when the card has been continuously visible past the
  // threshold for VISIBLE_DWELL_MS. The timer is cleared on exit so a quick
  // scroll past never trips it.
  useEffect(() => {
    if (!isNew) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!visibleTimer.current) {
            visibleTimer.current = setTimeout(() => {
              visibleTimer.current = null;
              fireSeen();
            }, VISIBLE_DWELL_MS);
          }
        } else if (visibleTimer.current) {
          clearTimeout(visibleTimer.current);
          visibleTimer.current = null;
        }
      },
      { threshold: 0.6 }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (visibleTimer.current) {
        clearTimeout(visibleTimer.current);
        visibleTimer.current = null;
      }
    };
  }, [isNew, fireSeen]);

  // Hover-dwell: lingering the pointer over the card for HOVER_DWELL_MS marks
  // it viewed; leaving clears the pending timer.
  const handleMouseEnter = useCallback(() => {
    if (!isNew || hoverTimer.current) return;
    hoverTimer.current = setTimeout(() => {
      hoverTimer.current = null;
      fireSeen();
    }, HOVER_DWELL_MS);
  }, [isNew, fireSeen]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }, []);

  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

  return (
    <div
      ref={ref}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "card group overflow-hidden transition-shadow duration-700",
        isNew && "ring-1 ring-accent/40 shadow-glow"
      )}
    >
      {playing ? (
        <div className="relative aspect-video overflow-hidden bg-ink-950">
          <iframe
            src={`https://www.youtube.com/embed/${video.videoId}?autoplay=1&rel=0`}
            title={video.title}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : embedVideos ? (
        <button
          type="button"
          onClick={startPlaying}
          className="block w-full text-left"
          aria-label={`Play ${video.title}`}
        >
          <div className="relative aspect-video overflow-hidden">
            <img
              src={video.thumbnail}
              alt={video.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-950/60 to-transparent" />
            {isNew && (
              <div className="absolute top-2 left-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-950 shadow-glow">
                  New
                </span>
              </div>
            )}
            <div className="absolute bottom-2 right-2">
              <div className="size-8 rounded-lg bg-accent/90 grid place-items-center shadow-glow transition-transform group-hover:scale-110">
                <svg className="size-4 text-ink-950" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </div>
        </button>
      ) : (
        <a href={video.url} target="_blank" rel="noopener noreferrer" className="block">
          <div className="relative aspect-video overflow-hidden">
            <img
              src={video.thumbnail}
              alt={video.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink-950/60 to-transparent" />
            {isNew && (
              <div className="absolute top-2 left-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-950 shadow-glow">
                  New
                </span>
              </div>
            )}
            <div className="absolute bottom-2 right-2">
              <div className="size-8 rounded-lg bg-accent/90 grid place-items-center shadow-glow transition-transform group-hover:scale-110">
                <svg className="size-4 text-ink-950" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </div>
        </a>
      )}

      <div className="px-4 pt-3 pb-4">
        <div className="flex items-start justify-between gap-2">
          <a href={video.url} target="_blank" rel="noopener noreferrer"
            className="block text-base font-semibold leading-snug text-ink-100 hover:text-accent transition-colors line-clamp-2">
            {video.title}
          </a>
          <button
            onClick={(e) => { e.preventDefault(); onWatchLater(); }}
            className={cn(
              "shrink-0 -mr-1 -mt-0.5 p-1.5 rounded-lg transition-colors",
              video.watchLater
                ? "text-accent"
                : "text-ink-500 hover:text-ink-200 opacity-0 group-hover:opacity-100"
            )}
            title={video.watchLater ? "Remove from Watch Later" : "Save to Watch Later"}
          >
            <Bookmark size={16} fill={video.watchLater ? "currentColor" : "none"} />
          </button>
        </div>
        <div className="flex items-start gap-3 mt-2.5">
          {avatar ? (
            <img
              src={avatar}
              alt={video.channelName}
              className="size-9 rounded-full object-cover shrink-0 mt-0.5"
            />
          ) : (
            <div className="size-9 rounded-full bg-ink-700 grid place-items-center shrink-0 mt-0.5">
              <Video size={14} className="text-ink-400" />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-sm text-ink-300">{video.channelName}</div>
            <div className="text-[12px] text-ink-400">
              {fmtDate(video.publishedAt)} · {fmtRelative(video.publishedAt)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
