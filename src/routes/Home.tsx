import { useEffect, useRef, useState, useCallback } from "react";
import { Video, LayoutGrid, Square } from "lucide-react";
import { cn, fmtRelative, fmtDate } from "../lib/utils";
import type { Video as VideoType, Channel } from "../../schema/types";

type ViewMode = "grid" | "single";

export function Home() {
  const [videos, setVideos] = useState<VideoType[]>([]);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>(
    () => (localStorage.getItem("ot:view") as ViewMode) || "grid"
  );

  const fetchVideos = useCallback(async () => {
    // fetch ALL videos — watched ones stay in the feed, they just lose the glow
    const res = await fetch(`/api/videos?limit=500`);
    const data = await res.json();
    setVideos(data.items || []);
    setLoading(false);
  }, []);

  const fetchAvatars = useCallback(async () => {
    const res = await fetch(`/api/channels`);
    const data = await res.json();
    const map: Record<string, string> = {};
    (data.channels || []).forEach((c: Channel) => {
      if (c.avatar) map[c.channelId] = c.avatar;
    });
    setAvatars(map);
  }, []);

  useEffect(() => {
    fetchVideos();
    fetchAvatars();
  }, [fetchVideos, fetchAvatars]);

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
      <div className="flex items-center justify-end">
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
              No videos yet.
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
              onSeen={() => markWatched(video.videoId)}
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
              onSeen={() => markWatched(video.videoId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface VideoCardProps {
  video: VideoType;
  avatar?: string;
  onSeen: () => void;
}

function VideoCard({ video, avatar, onSeen }: VideoCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const hasEntered = useRef(false);
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isNew = !video.watched;

  useEffect(() => {
    if (!isNew) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // require the card to actually linger in view (not a fast-scroll
          // flyby) before it counts as "seen"
          if (!dwellTimer.current) {
            dwellTimer.current = setTimeout(() => {
              hasEntered.current = true;
            }, 700);
          }
        } else {
          // left view: cancel a pending dwell
          if (dwellTimer.current) {
            clearTimeout(dwellTimer.current);
            dwellTimer.current = null;
          }
          // only mark seen if it had genuinely lingered earlier
          if (hasEntered.current) {
            onSeen();
          }
        }
      },
      { threshold: 0.6 }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (dwellTimer.current) clearTimeout(dwellTimer.current);
    };
  }, [isNew, onSeen]);

  return (
    <div
      ref={ref}
      className={cn(
        "card group overflow-hidden transition-shadow duration-700",
        isNew && "ring-1 ring-accent/40 shadow-glow"
      )}
    >
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

      <div className="px-4 pt-3 pb-4">
        <a href={video.url} target="_blank" rel="noopener noreferrer"
          className="block text-base font-semibold leading-snug text-ink-100 hover:text-accent transition-colors line-clamp-2">
          {video.title}
        </a>
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
