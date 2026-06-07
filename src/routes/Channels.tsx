import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Youtube, Users, Tag, Copy, Check, Undo2, EyeOff } from "lucide-react";
import { cn } from "../lib/utils";
import type { Channel } from "../../schema/types";
import { normalizeGroup } from "../../schema/types";

type GroupInfo = { group: string; count: number };

// The API now carries soft-delete metadata; reflect it locally until the
// shared Channel type picks these optional fields up.
type ChannelRow = Channel & { deleted?: boolean; deletedAt?: string };

export function Channels() {
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState("default");
  const [isAdding, setIsAdding] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [movingId, setMovingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const fetchChannels = async (includeDeleted = showDeleted) => {
    const res = await fetch(includeDeleted ? "/api/channels?includeDeleted=1" : "/api/channels");
    const data = await res.json();
    setChannels(data.channels || []);
  };

  const fetchGroups = async () => {
    const res = await fetch("/api/groups");
    const data = await res.json();
    setGroups(data.groups || []);
  };

  useEffect(() => {
    fetchChannels(showDeleted);
    fetchGroups();
  }, [showDeleted]);

  // Selectable group names = config-defined groups (from the server).
  const groupNames = useMemo(() => groups.map((g) => g.group), [groups]);

  const visible = useMemo(
    () => (filter === "all" ? channels : channels.filter((c) => (c.group || "default") === filter)),
    [channels, filter]
  );

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newId || !newName) return;

    await fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: newId, name: newName, group: newGroup || "default" }),
    });

    setNewId("");
    setNewName("");
    setNewGroup("default");
    setIsAdding(false);
    fetchChannels();
    fetchGroups();
  };

  // Soft-remove: DELETE now just marks the channel deleted. The row drops out
  // of the default list (and stays visible only when "Show deleted" is on).
  const handleRemove = async (channelId: string) => {
    await fetch(`/api/channels/${channelId}`, { method: "DELETE" });
    fetchChannels();
    fetchGroups();
  };

  // Clear the deleted flag and refresh.
  const handleRestore = async (channelId: string) => {
    await fetch(`/api/channels/${channelId}/restore`, { method: "POST" });
    fetchChannels();
    fetchGroups();
  };

  // Commit a group change from the dropdown. No-op when unchanged.
  const commitMove = async (channelId: string, value: string) => {
    const target = normalizeGroup(value);
    const ch = channels.find((c) => c.channelId === channelId);
    setMovingId(null);
    if (!ch || normalizeGroup(ch.group) === target) return;
    await fetch(`/api/channels/${channelId}/group`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group: target }),
    });
    fetchChannels();
    fetchGroups();
  };

  // Options for a channel's group dropdown: the selectable groups plus the
  // channel's own current group (in case it's a legacy/unconfigured value).
  const optionsFor = (current: string): string[] => {
    const set = new Set<string>([...groupNames, normalizeGroup(current)]);
    return [...set].sort();
  };

  // Copy a channel ID to the clipboard, showing a brief per-row confirmation.
  const copyId = async (channelId: string) => {
    try {
      await navigator.clipboard.writeText(channelId);
      setCopiedId(channelId);
      setTimeout(() => setCopiedId((cur) => (cur === channelId ? null : cur)), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const groupSelectClass =
    "bg-ink-900 border border-white/10 rounded px-1.5 py-0.5 text-[11px] text-ink-100 focus:outline-none focus:border-accent/50";

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-ink-300" />
            <h2 className="card-title">Channels</h2>
            <span className="text-[11px] text-ink-500">({channels.length})</span>
          </div>
          <button
            onClick={() => setIsAdding(true)}
            className="btn btn-accent text-[12px]"
          >
            <Plus size={14} />
            Add
          </button>
        </div>

        <div className="card-body">
          {/* Show-deleted toggle — off by default; on fetches includeDeleted=1 */}
          <div className="flex items-center justify-end mb-3">
            <button
              onClick={() => setShowDeleted((v) => !v)}
              className={cn(
                "btn text-[12px] ring-1",
                showDeleted
                  ? "btn-accent ring-accent/40"
                  : "btn-ghost ring-white/10 text-ink-300 hover:text-ink-100"
              )}
              title={showDeleted ? "Hiding deleted channels" : "Showing deleted channels"}
            >
              <EyeOff size={14} />
              Show deleted
            </button>
          </div>
          {/* Group filter — groups come from config (server), not free text */}
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            <GroupChip label={`All (${channels.length})`} active={filter === "all"} onClick={() => setFilter("all")} />
            {groups.map((g) => (
              <GroupChip key={g.group} label={`${g.group} (${g.count})`} active={filter === g.group} onClick={() => setFilter(g.group)} />
            ))}
          </div>

          {isAdding && (
            <form onSubmit={handleAdd} className="mb-4 p-4 bg-ink-800/50 rounded-xl border border-white/5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] uppercase tracking-[0.12em] text-ink-400 mb-1.5 block">Channel ID</label>
                  <input
                    type="text"
                    placeholder="UCxxxxxxxxxxxxxxxxx"
                    value={newId}
                    onChange={(e) => setNewId(e.target.value)}
                    className="w-full bg-ink-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
                  />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-[0.12em] text-ink-400 mb-1.5 block">Channel Name</label>
                  <input
                    type="text"
                    placeholder="Channel Name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full bg-ink-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
                  />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-[0.12em] text-ink-400 mb-1.5 block">Group</label>
                  <select
                    value={newGroup}
                    onChange={(e) => setNewGroup(e.target.value)}
                    className="w-full bg-ink-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-ink-100 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
                  >
                    {(groupNames.length ? groupNames : ["default"]).map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button type="submit" className="btn btn-accent text-[12px]">Add Channel</button>
                <button type="button" onClick={() => setIsAdding(false)} className="btn btn-ghost text-[12px]">Cancel</button>
              </div>
            </form>
          )}

          {visible.length === 0 ? (
            <div className="text-center py-20 text-ink-400">
              <Youtube size={32} className="mx-auto mb-3 opacity-30" />
              <p>No channels. Add one to get started.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {visible.map((c) => (
                <div
                  key={c.channelId}
                  className={cn(
                    "group flex items-center justify-between gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-white/[0.03]",
                    c.deleted && "opacity-50"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {c.avatar ? (
                      <img
                        src={c.avatar}
                        alt={c.name}
                        className="size-10 rounded-full object-cover ring-1 ring-white/10 shrink-0"
                      />
                    ) : (
                      <div className="size-10 rounded-full bg-ink-700 grid place-items-center shrink-0 ring-1 ring-white/10">
                        <Youtube size={16} className="text-ink-400" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          href={`https://www.youtube.com/channel/${c.channelId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            "text-sm font-medium text-ink-100 truncate hover:text-accent transition-colors",
                            c.deleted && "line-through"
                          )}
                        >
                          {c.name}
                        </a>
                        {c.deleted && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-verdict-stop/20 text-verdict-stop">deleted</span>
                        )}
                        {c.source === "config" ? (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-ink-700 text-ink-300">config</span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/20 text-accent">ui</span>
                        )}
                        {movingId === c.channelId ? (
                          <select
                            autoFocus
                            defaultValue={normalizeGroup(c.group)}
                            onChange={(e) => commitMove(c.channelId, e.target.value)}
                            onBlur={() => setMovingId(null)}
                            className={groupSelectClass}
                          >
                            {optionsFor(c.group).map((g) => (
                              <option key={g} value={g}>{g}</option>
                            ))}
                          </select>
                        ) : (
                          <button
                            onClick={() => setMovingId(c.channelId)}
                            title="Click to change group"
                            className="text-[9px] px-1.5 py-0.5 rounded bg-ink-700 text-ink-300 inline-flex items-center gap-1 hover:bg-ink-600 hover:text-accent transition-colors"
                          >
                            <Tag size={9} />{c.group || "default"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => copyId(c.channelId)}
                      className={cn(
                        "btn btn-ghost transition-all",
                        copiedId === c.channelId
                          ? "opacity-100 text-accent"
                          : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-ink-400 hover:text-ink-100"
                      )}
                      title={copiedId === c.channelId ? "Copied!" : "Copy channel ID"}
                    >
                      {copiedId === c.channelId ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                    {c.deleted ? (
                      <button
                        onClick={() => handleRestore(c.channelId)}
                        className="btn btn-ghost opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-ink-400 hover:text-accent"
                        title="Restore"
                      >
                        <Undo2 size={14} />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleRemove(c.channelId)}
                        className="btn btn-ghost opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-ink-400 hover:text-verdict-stop"
                        title="Remove"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GroupChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-lg text-[12px] font-medium transition-colors",
        active
          ? "text-ink-950 bg-accent shadow-glow"
          : "text-ink-300 bg-white/[0.04] hover:text-ink-100 hover:bg-white/[0.08]"
      )}
    >
      {label}
    </button>
  );
}
