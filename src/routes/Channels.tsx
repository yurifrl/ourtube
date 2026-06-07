import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Youtube, Users, Tag } from "lucide-react";
import { cn } from "../lib/utils";
import type { Channel } from "../../schema/types";
import { normalizeGroup } from "../../schema/types";

type GroupInfo = { group: string; count: number };

export function Channels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState("default");
  const [isAdding, setIsAdding] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [movingId, setMovingId] = useState<string | null>(null);

  const fetchChannels = async () => {
    const res = await fetch("/api/channels");
    const data = await res.json();
    setChannels(data.channels || []);
  };

  const fetchGroups = async () => {
    const res = await fetch("/api/groups");
    const data = await res.json();
    setGroups(data.groups || []);
  };

  useEffect(() => {
    fetchChannels();
    fetchGroups();
  }, []);

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

  const handleRemove = async (channelId: string) => {
    await fetch(`/api/channels/${channelId}`, { method: "DELETE" });
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
            <div className="divide-y divide-white/5">
              {visible.map((c) => (
                <div key={c.channelId} className="py-3 flex items-center justify-between group">
                  <div className="flex items-center gap-3 min-w-0">
                    {c.avatar ? (
                      <img
                        src={c.avatar}
                        alt={c.name}
                        className="size-10 rounded-full object-cover ring-1 ring-white/10 shrink-0"
                      />
                    ) : (
                      <div className="size-10 rounded-full bg-ink-700 grid place-items-center shrink-0">
                        <Youtube size={16} className="text-ink-400" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink-100 flex items-center gap-2">
                        {c.name}
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
                      <div className="text-[11px] text-ink-400 font-mono mt-0.5">{c.channelId}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRemove(c.channelId)}
                      className="btn btn-ghost opacity-0 group-hover:opacity-100 transition-opacity text-ink-400 hover:text-verdict-stop"
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
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
