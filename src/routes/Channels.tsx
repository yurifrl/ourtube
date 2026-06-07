import { useEffect, useState } from "react";
import { Plus, Trash2, Youtube, Users } from "lucide-react";
import type { Channel } from "../../schema/types";

export function Channels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const fetchChannels = async () => {
    const res = await fetch("/api/channels");
    const data = await res.json();
    setChannels(data.channels || []);
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newId || !newName) return;

    await fetch("/api/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: newId, name: newName }),
    });

    setNewId("");
    setNewName("");
    setIsAdding(false);
    fetchChannels();
  };

  const handleRemove = async (channelId: string) => {
    await fetch(`/api/channels/${channelId}`, { method: "DELETE" });
    fetchChannels();
  };

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
          {isAdding && (
            <form onSubmit={handleAdd} className="mb-4 p-4 bg-ink-800/50 rounded-xl border border-white/5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
              </div>
              <div className="flex gap-2 mt-4">
                <button type="submit" className="btn btn-accent text-[12px]">Add Channel</button>
                <button type="button" onClick={() => setIsAdding(false)} className="btn btn-ghost text-[12px]">Cancel</button>
              </div>
            </form>
          )}

          {channels.length === 0 ? (
            <div className="text-center py-20 text-ink-400">
              <Youtube size={32} className="mx-auto mb-3 opacity-30" />
              <p>No channels. Add one to get started.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {channels.map((c) => (
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
                      </div>
                      <div className="text-[11px] text-ink-400 font-mono mt-0.5">{c.channelId}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemove(c.channelId)}
                    className="btn btn-ghost opacity-0 group-hover:opacity-100 transition-opacity text-ink-400 hover:text-verdict-stop"
                    title="Remove"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
