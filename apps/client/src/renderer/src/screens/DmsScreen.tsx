import { useCallback, useEffect, useState, type ReactElement } from "react";
import type { DmThreadEntry } from "@redvoice/shared";
import { useAuthStore } from "../lib/auth-context.js";
import { ApiClient } from "../lib/api.js";
import { DmThreadList } from "../components/DmThreadList.js";
import { NewDmPicker } from "../components/NewDmPicker.js";
import { RoomChatPanel } from "../components/RoomChatPanel.js";
import { I } from "../components/Icons.js";

export function DmsScreen(): ReactElement {
  const me = useAuthStore((s) => s.user);
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const token = useAuthStore((s) => s.token);

  const [threads, setThreads] = useState<DmThreadEntry[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activePeer, setActivePeer] = useState<{ id: string; handle: string | null; displayName: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const api = new ApiClient(serverUrl);
    api.setToken(token);
    try {
      const r = await api.dmThreads();
      setThreads(r.threads);
    } catch { /* */ }
  }, [serverUrl, token]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Sync displayed peer when user picks an existing thread.
  useEffect(() => {
    if (!active) { setActivePeer(null); return; }
    const t = threads.find((x) => x.threadId === active);
    if (t) setActivePeer(t.otherParticipant);
  }, [active, threads]);

  const onPick = useCallback((threadId: string, peer: { id: string; handle: string | null; displayName: string }) => {
    setActive(threadId);
    setActivePeer(peer);
    void refresh();
  }, [refresh]);

  if (!me) return <div />;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "280px 1fr",
        height: "100%",
        background: "var(--bg)",
      }}
    >
      <aside
        style={{
          borderRight: "1px solid var(--border-soft)",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", padding: "var(--s-3) var(--s-4)" }}>
          <span style={{ fontWeight: 600, fontSize: "var(--t-md)", flex: 1 }}>Direct messages</span>
          <button
            type="button"
            className="rv-btn"
            data-variant="primary"
            onClick={() => setPickerOpen(true)}
            style={{ height: "1.8rem", padding: "0 var(--s-3)", fontSize: "var(--t-sm)" }}
          >
            <I.Plus size={12} /> New
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "var(--s-2) var(--s-3)" }}>
          <DmThreadList threads={threads} activeThreadId={active} onSelect={setActive} />
        </div>
      </aside>

      <main style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        {active && activePeer ? (
          <>
            <header
              style={{
                padding: "var(--s-3) var(--s-5)",
                borderBottom: "1px solid var(--border-soft)",
                display: "flex",
                alignItems: "center",
                gap: "var(--s-3)",
              }}
            >
              <span style={{ fontWeight: 600 }}>
                {activePeer.handle ? `@${activePeer.handle}` : activePeer.displayName}
              </span>
              {activePeer.handle && (
                <span style={{ color: "var(--text-faint)", fontSize: "var(--t-sm)" }}>{activePeer.displayName}</span>
              )}
            </header>
            <div style={{ flex: 1, minHeight: 0 }}>
              <RoomChatPanel
                threadType="dm"
                threadId={active}
                localIdentity={me.id}
                localName={me.displayName}
                onClose={() => setActive(null)}
              />
            </div>
          </>
        ) : (
          <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--text-faint)", padding: "var(--s-7)" }}>
            <div style={{ textAlign: "center", maxWidth: 320 }}>
              <h2 style={{ fontSize: "var(--t-xl)", fontWeight: 600, color: "var(--text)", marginBottom: "var(--s-3)" }}>
                Start a conversation
              </h2>
              <p style={{ marginBottom: "var(--s-5)" }}>Click <strong>+ New</strong> to message someone by their @handle.</p>
              <button
                type="button"
                className="rv-btn"
                data-variant="primary"
                onClick={() => setPickerOpen(true)}
              >
                <I.Plus size={14} /> New conversation
              </button>
            </div>
          </div>
        )}
      </main>

      <NewDmPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={onPick} />
    </div>
  );
}
