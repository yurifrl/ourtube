import { useEffect, useState, useCallback } from "react";
import { Settings, Zap, Bell } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { cn } from "../lib/utils";

export function Layout() {
  const [newCount, setNewCount] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/videos?unwatched=1&limit=1");
      const data = await res.json();
      setNewCount(data.totalCount ?? 0);
    } catch {
      /* offline */
    }
  }, []);

  const markAllViewed = useCallback(async () => {
    if (!newCount || newCount <= 0) return;
    try {
      await fetch("/api/videos/mark-all-watched", { method: "POST" });
    } catch {
      /* ignore */
    }
    setNewCount(0);
    window.dispatchEvent(new Event("ot:feedchanged"));
  }, [newCount]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    const onChange = () => refresh();
    window.addEventListener("ot:feedchanged", onChange);
    return () => {
      clearInterval(id);
      window.removeEventListener("ot:feedchanged", onChange);
    };
  }, [refresh]);

  const hasNew = !!newCount && newCount > 0;

  return (
    <div className="relative min-h-screen text-ink-100">
      <header className="sticky top-0 z-20 backdrop-blur-xl bg-ink-950/70 border-b border-white/5">
        <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-10 py-3.5 flex items-center gap-3 sm:gap-4">
          <Link to="/" className="flex items-center gap-3 group cursor-pointer hover:opacity-90 transition-opacity">
            <div className="size-9 rounded-xl bg-gradient-to-br from-accent to-accent-dim grid place-items-center shadow-glow shrink-0">
              <Zap size={18} className="text-ink-950" strokeWidth={2.5} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-ink-300">ourtube</div>
              <div className="text-[14px] font-medium text-ink-100 truncate">personal feed</div>
            </div>
          </Link>

          <button
            type="button"
            onClick={markAllViewed}
            disabled={!hasNew}
            title={hasNew ? "Mark all as viewed" : "No new videos"}
            aria-label={hasNew ? `${newCount} new videos, click to mark all viewed` : "No new videos"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-all",
              hasNew
                ? "bg-accent text-ink-950 shadow-glow ring-1 ring-accent/40 cursor-pointer hover:brightness-110 active:scale-[0.97]"
                : "bg-white/[0.04] text-ink-400 ring-1 ring-white/5 cursor-default"
            )}
          >
            <Bell size={14} className={hasNew ? "animate-breathe" : undefined} strokeWidth={2.5} />
            {newCount ?? 0} new
          </button>

          <nav className="ml-auto flex items-center gap-1 bg-white/[0.025] ring-1 ring-white/5 rounded-xl p-1">
            <NavLink
              to="/channels"
              title="Settings"
              aria-label="Settings"
              className={({ isActive }) =>
                cn(
                  "relative flex items-center justify-center size-8 rounded-lg transition-colors",
                  isActive
                    ? "text-ink-950 bg-accent shadow-glow"
                    : "text-ink-300 hover:text-ink-100 hover:bg-white/[0.04]"
                )
              }
            >
              <Settings size={16} />
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-10 pb-32 max-w-[1500px] mx-auto pt-5">
        <Outlet />
      </main>
    </div>
  );
}
