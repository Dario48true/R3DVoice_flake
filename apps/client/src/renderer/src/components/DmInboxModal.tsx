import { useEffect, useState, type ReactElement } from "react";
import type { DmThreadEntry } from "@redvoice/shared";
import { ApiClient } from "../lib/api.js";
import { useAuthStore } from "../lib/auth-context.js";
import { Modal } from "./Modal.js";
import { I } from "./Icons.js";
import { RoomChatPanel } from "./RoomChatPanel.js";

interface Props {
  open: boolean;
  onClose(): void;
}

export function DmInboxModal({ open, onClose }: Props): ReactElement {
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  const [threads, setThreads] = useState<DmThreadEntry[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !token) return;
    setLoading(true);
    setError(null);
    const api = new ApiClient(serverUrl);
    api.setToken(token);
    let cancelled = false;
    void api
      .dmThreads()
      .then((res) => {
        if (!cancelled) setThreads(res.threads);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, serverUrl, token]);

  const otherName = (thread: DmThreadEntry): string => {
    // Prefer the last-message author when it's not us; otherwise fall back to
    // a generic placeholder until we have a user-lookup endpoint.
    if (user && thread.lastMessage.authorId !== user.id) return thread.lastMessage.authorName;
    return "(other participant)";
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        setActiveThreadId(null);
        onClose();
      }}
      title={activeThreadId ? "Direct message" : "Direct messages"}
      width="min(94vw, 720px)"
    >
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", height: 540 }}>
        <nav
          className="rv-scroll"
          style={{
            borderRight: "1px solid var(--border-soft)",
            overflowY: "auto",
          }}
        >
          {loading && (
            <div style={{ padding: "var(--s-5)", color: "var(--text-faint)", fontSize: "var(--t-xs)" }}>
              Loading…
            </div>
          )}
          {error && (
            <div style={{ padding: "var(--s-5)", color: "var(--accent-glow)", fontSize: "var(--t-xs)" }}>
              {error}
            </div>
          )}
          {!loading && !error && threads.length === 0 && (
            <div
              style={{
                padding: "var(--s-5)",
                color: "var(--text-faint)",
                fontSize: "var(--t-xs)",
                lineHeight: 1.5,
              }}
            >
              No DMs yet. Right-click a participant in a room → "Send a DM" to start a thread.
            </div>
          )}
          {threads.map((t) => (
            <button
              key={t.threadId}
              type="button"
              onClick={() => setActiveThreadId(t.threadId)}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                width: "100%",
                appearance: "none",
                border: 0,
                background:
                  activeThreadId === t.threadId
                    ? "color-mix(in oklch, var(--accent) 14%, var(--bg-elev-2))"
                    : "transparent",
                padding: "var(--s-3) var(--s-4)",
                borderBottom: "1px solid var(--border-soft)",
                cursor: "pointer",
                textAlign: "left",
                color: "var(--text)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
                <span className="rv-avatar" data-tone={(t.threadId.charCodeAt(0) % 5) + 1} style={{ width: 26, height: 26, fontSize: 11 }}>
                  {otherName(t).charAt(0).toUpperCase() || "?"}
                </span>
                <span style={{ fontWeight: 500, fontSize: "var(--t-sm)" }}>{otherName(t)}</span>
              </div>
              <span
                className="rv-mono"
                style={{
                  fontSize: "var(--t-2xs)",
                  color: "var(--text-faint)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {t.lastMessage.body ?? "(deleted)"}
              </span>
            </button>
          ))}
        </nav>
        <div style={{ position: "relative" }}>
          {activeThreadId && user ? (
            <RoomChatPanel
              threadType="dm"
              threadId={activeThreadId}
              localIdentity={user.id}
              localName={user.displayName}
              onClose={() => setActiveThreadId(null)}
            />
          ) : (
            <div
              style={{
                display: "grid",
                placeItems: "center",
                height: "100%",
                color: "var(--text-faint)",
                fontSize: "var(--t-sm)",
                padding: "var(--s-5)",
                textAlign: "center",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--s-3)" }}>
                <I.Chat size={32} />
                Select a thread to read messages.
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
