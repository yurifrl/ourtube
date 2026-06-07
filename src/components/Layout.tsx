import { useEffect, useState, useCallback } from "react";
import { Video, List, Zap } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { cn } from "../lib/utils";

const TABS = [
  { to: "/", label: "Feed", icon: Video, end: true },
  { to: "/channels", label: "Channels", icon: List },
];

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

  return (
    <div className="relative min-h-screen text-ink-100">
      <header className="sticky top-0 z-20 backdrop-blur-xl bg-ink-950/70 border-b border-white/5">
        <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-10 py-3.5 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-3 group cursor-pointer hover:opacity-90 transition-opacity">
            <div className="size-9 rounded-xl bg-gradient-to-br from-accent to-accent-dim grid place-items-center shadow-glow shrink-0">
              <Zap size={18} className="text-ink-950" strokeWidth={2.5} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-ink-300">ourtube</div>
              <div className="text-[14px] font-medium text-ink-100 truncate">personal feed</div>
            </div>
          </Link>

          <nav className="flex items-center gap-1 bg-white/[0.025] ring-1 ring-white/5 rounded-xl p-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <NavLink
                  key={t.to}
                  to={t.to}
                  end={t.end}
                  className={({ isActive }) =>
                    cn(
                      "relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap",
                      isActive
                        ? "text-ink-950 bg-accent shadow-glow"
                        : "text-ink-300 hover:text-ink-100 hover:bg-white/[0.04]"
                    )
                  }
                >
                  <Icon size={14} />
                  {t.label}
                </NavLink>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
                newCount && newCount > 0
                  ? "bg-accent/15 text-accent ring-1 ring-accent/30"
                  : "bg-white/[0.04] text-ink-400 ring-1 ring-white/5"
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  newCount && newCount > 0 ? "bg-accent animate-breathe" : "bg-ink-500"
                )}
              />
              {newCount ?? 0} new
            </span>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-10 pb-32 max-w-[1500px] mx-auto pt-5">
        <Outlet />
      </main>
    </div>
  );
}
