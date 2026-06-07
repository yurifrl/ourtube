import { useEffect, useRef, useState, useCallback } from "react";
import { Video } from "lucide-react";
import { cn, fmtRelative } from "../lib/utils";
import type { Video as VideoType } from "../../schema/types";

export function Home() {
  const [videos, setVideos] = useState<VideoType[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVideos = useCallback(async () => {
    // fetch ALL videos — watched ones stay in the feed, they just lose the glow
    const res = await fetch(`/api/videos?limit=500`);
    const data = await res.json();
    setVideos(data.items || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

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
  }, []);

  const newCount = videos.filter((v) => !v.watched).length;

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
      <div className="flex items-center justify-between sticky top-[60px] z-10 py-2">
        <h2 className="text-lg font-semibold text-ink-100">Feed</h2>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
              newCount > 0
                ? "bg-accent/15 text-accent ring-1 ring-accent/30"
                : "bg-white/[0.04] text-ink-400 ring-1 ring-white/5"
            )}
          >
            <span className={cn("size-1.5 rounded-full", newCount > 0 ? "bg-accent animate-breathe" : "bg-ink-500")} />
            {newCount} new
          </span>
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {videos.map((video) => (
            <VideoCard
              key={video.videoId}
              video={video}
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
  onSeen: () => void;
}

function VideoCard({ video, onSeen }: VideoCardProps) {
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

      <div className="px-5 pt-4 pb-5">
        <a href={video.url} target="_blank" rel="noopener noreferrer"
          className="block text-sm font-medium text-ink-100 hover:text-accent transition-colors line-clamp-2">
          {video.title}
        </a>
        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-ink-400">
          <span>{video.channelName}</span>
          <span className="text-ink-600">·</span>
          <span>{fmtRelative(video.publishedAt)}</span>
        </div>
      </div>
    </div>
  );
}
