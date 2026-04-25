import { useEffect, useState, type ReactElement } from "react";
import type { FriendDTO } from "@redvoice/shared";
import { ApiClient } from "../lib/api.js";
import { useAuthStore } from "../lib/auth-context.js";
import { Modal } from "./Modal.js";
import { I } from "./Icons.js";

interface Props {
  open: boolean;
  onClose(): void;
  /** Called when the user clicks "Send DM" on an accepted friend. */
  onOpenDm?(threadId: string, friend: FriendDTO): void;
}

export function FriendsModal({ open, onClose, onOpenDm }: Props): ReactElement {
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const token = useAuthStore((s) => s.token);
  const me = useAuthStore((s) => s.user);

  const [friends, setFriends] = useState<FriendDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [busy, setBusy] = useState(false);

  const apiFor = (): ApiClient => {
    const api = new ApiClient(serverUrl);
    api.setToken(token);
    return api;
  };

  const refresh = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFor().friends();
      setFriends(res.friends);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !token) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, token, serverUrl]);

  const handleSend = async (): Promise<void> => {
    const email = emailInput.trim();
    if (!email) return;
    setBusy(true);
    setError(null);
    try {
      await apiFor().friendRequest(email);
      setEmailInput("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to send");
    } finally {
      setBusy(false);
    }
  };

  const handleAccept = async (id: string): Promise<void> => {
    try {
      await apiFor().friendAccept(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to accept");
    }
  };

  const handleReject = async (id: string): Promise<void> => {
    try {
      await apiFor().friendReject(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to remove");
    }
  };

  const incoming = friends.filter((f) => f.status === "pending-incoming");
  const outgoing = friends.filter((f) => f.status === "pending-outgoing");
  const accepted = friends.filter((f) => f.status === "accepted");

  return (
    <Modal open={open} onClose={onClose} title="Friends" width="min(94vw, 600px)">
      <div style={{ padding: "var(--s-5) var(--s-6)", display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
        {/* Add by email */}
        <div>
          <div className="rv-label" style={{ marginBottom: "var(--s-2)" }}>Add a friend</div>
          <div style={{ display: "flex", gap: "var(--s-2)" }}>
            <input
              className="rv-input"
              type="email"
              placeholder="email@example.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              style={{ flex: 1 }}
              disabled={busy}
            />
            <button
              type="button"
              className="rv-btn"
              data-variant="primary"
              onClick={() => void handleSend()}
              disabled={busy || !emailInput.trim()}
            >
              <I.Plus size={14} /> Request
            </button>
          </div>
          <div style={{ fontSize: "var(--t-xs)", color: "var(--text-faint)", marginTop: 4 }}>
            They'll see your request in their Friends tab and can accept or reject.
          </div>
        </div>

        {error && (
          <div
            style={{
              color: "var(--accent-glow)",
              fontSize: "var(--t-sm)",
              padding: "var(--s-2) var(--s-3)",
              border: "1px solid color-mix(in oklch, var(--accent) 40%, transparent)",
              borderRadius: "var(--r-sm)",
              background: "color-mix(in oklch, var(--accent) 8%, var(--bg-elev-2))",
            }}
          >
            {error}
          </div>
        )}

        {loading && (
          <div style={{ color: "var(--text-faint)", fontSize: "var(--t-xs)", textAlign: "center" }}>
            Loading…
          </div>
        )}

        {!loading && incoming.length > 0 && (
          <Section
            title={`Incoming requests · ${incoming.length}`}
            tone="amber"
          >
            {incoming.map((f) => (
              <FriendRow
                key={f.friendshipId}
                friend={f}
                actions={
                  <>
                    <button
                      className="rv-btn"
                      data-variant="primary"
                      style={{ height: "1.8rem", fontSize: "var(--t-xs)" }}
                      onClick={() => void handleAccept(f.friendshipId)}
                    >
                      Accept
                    </button>
                    <button
                      className="rv-btn"
                      data-variant="ghost"
                      style={{ height: "1.8rem", fontSize: "var(--t-xs)" }}
                      onClick={() => void handleReject(f.friendshipId)}
                    >
                      Reject
                    </button>
                  </>
                }
              />
            ))}
          </Section>
        )}

        {!loading && outgoing.length > 0 && (
          <Section title={`Outgoing · ${outgoing.length}`}>
            {outgoing.map((f) => (
              <FriendRow
                key={f.friendshipId}
                friend={f}
                hint="pending"
                actions={
                  <button
                    className="rv-btn"
                    data-variant="ghost"
                    style={{ height: "1.8rem", fontSize: "var(--t-xs)" }}
                    onClick={() => void handleReject(f.friendshipId)}
                  >
                    Cancel
                  </button>
                }
              />
            ))}
          </Section>
        )}

        {!loading && (
          <Section title={`Friends · ${accepted.length}`} tone="live">
            {accepted.length === 0 ? (
              <div style={{ color: "var(--text-faint)", fontSize: "var(--t-xs)", padding: "var(--s-3)", textAlign: "center" }}>
                No friends yet. Send a request above.
              </div>
            ) : (
              accepted.map((f) => (
                <FriendRow
                  key={f.friendshipId}
                  friend={f}
                  actions={
                    <>
                      {onOpenDm && me && (
                        <button
                          className="rv-btn"
                          data-variant="ghost"
                          style={{ height: "1.8rem", fontSize: "var(--t-xs)" }}
                          onClick={() => {
                            const tid = canonicalDmThreadId(me.id, f.user.id);
                            onOpenDm(tid, f);
                            onClose();
                          }}
                        >
                          <I.Chat size={12} /> DM
                        </button>
                      )}
                      <button
                        className="rv-btn"
                        data-variant="ghost"
                        style={{ height: "1.8rem", fontSize: "var(--t-xs)" }}
                        onClick={() => void handleReject(f.friendshipId)}
                      >
                        Remove
                      </button>
                    </>
                  }
                />
              ))
            )}
          </Section>
        )}
      </div>
    </Modal>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "live" | "amber";
  children: React.ReactNode;
}): ReactElement {
  return (
    <div>
      <div className="rv-section-head">
        <span className="rv-label">{title}</span>
        {tone && (
          <span className="rv-badge" data-tone={tone}>
            {tone === "live" && <span className="pip" />}
            {tone}
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>{children}</div>
    </div>
  );
}

function FriendRow({
  friend,
  actions,
  hint,
}: {
  friend: FriendDTO;
  actions: ReactElement;
  hint?: string;
}): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--s-3)",
        padding: "var(--s-2) 0",
        borderBottom: "1px solid var(--border-soft)",
      }}
    >
      <div style={{ position: "relative", flex: "none" }}>
        <span
          className="rv-avatar"
          data-tone={(friend.user.id.charCodeAt(0) % 5) + 1}
          style={{ width: 32, height: 32, fontSize: 13 }}
        >
          {friend.user.displayName.charAt(0).toUpperCase()}
        </span>
        {friend.status === "accepted" && (
          <span
            title={friend.isOnline ? "Online" : "Offline"}
            style={{
              position: "absolute",
              right: -2,
              bottom: -2,
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: friend.isOnline ? "var(--rv-live)" : "var(--rv-ink-400)",
              border: "2px solid var(--bg-elev)",
              boxShadow: friend.isOnline ? "0 0 6px var(--rv-live)" : "none",
            }}
          />
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
        <span style={{ fontWeight: 500, fontSize: "var(--t-sm)" }}>{friend.user.displayName}</span>
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
          {friend.user.email}
          {hint && ` · ${hint}`}
        </span>
      </div>
      <span style={{ display: "flex", gap: "var(--s-2)" }}>{actions}</span>
    </div>
  );
}

function canonicalDmThreadId(a: string, b: string): string {
  const [first, second] = a < b ? [a, b] : [b, a];
  return `${first}:${second}`;
}
