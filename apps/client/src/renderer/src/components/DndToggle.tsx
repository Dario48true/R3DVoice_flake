import { useCallback, useState, type ReactElement } from "react";
import { useAuthStore } from "../lib/auth-context.js";
import { ApiClient } from "../lib/api.js";

const PRESETS: { label: string; minutes: number | null }[] = [
  { label: "Off", minutes: 0 },
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "Until tomorrow", minutes: 24 * 60 },
];

export function DndToggle(): ReactElement {
  const me = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const token = useAuthStore((s) => s.token);
  const [busy, setBusy] = useState(false);

  const isActive = me?.dndUntil ? new Date(me.dndUntil).getTime() > Date.now() : false;

  const set = useCallback(async (minutes: number | null) => {
    setBusy(true);
    const api = new ApiClient(serverUrl); api.setToken(token);
    try {
      const until = minutes && minutes > 0 ? new Date(Date.now() + minutes * 60_000).toISOString() : null;
      await api.setDnd(until);
      await refreshUser();
    } finally { setBusy(false); }
  }, [serverUrl, token, refreshUser]);

  return (
    <div>
      <div style={{ fontSize: "var(--t-xs)", color: "var(--text-faint)", padding: "0 var(--s-3) var(--s-1)" }}>
        Do not disturb {isActive && <span style={{ color: "var(--rv-amber)" }}>· active</span>}
      </div>
      <select
        className="rv-input"
        defaultValue={0}
        onChange={(e) => {
          const v = Number(e.target.value);
          void set(v === 0 ? null : v);
        }}
        disabled={busy}
        style={{ width: "100%", height: "1.8rem", fontSize: "var(--t-xs)" }}
      >
        {PRESETS.map((p) => <option key={p.label} value={p.minutes ?? 0}>{p.label}</option>)}
      </select>
    </div>
  );
}
