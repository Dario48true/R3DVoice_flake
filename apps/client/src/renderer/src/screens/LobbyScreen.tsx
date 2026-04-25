import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type FormEvent, type ReactElement } from "react";
import { ApiClient } from "../lib/api.js";
import { createRoomsStore, type RoomsState } from "../lib/rooms-store.js";
import { useAuthStore } from "../lib/auth-context.js";
import { FeaturesPanel } from "../components/FeaturesPanel.js";
import { DmInboxModal } from "../components/DmInboxModal.js";
import { SettingsModal } from "../components/SettingsModal.js";
import { I } from "../components/Icons.js";
import { Spinner } from "../components/Primitives.js";
import { MOD_KEY } from "../lib/platform.js";
import { InRoomScreen } from "./InRoomScreen.js";
import { PreJoinScreen, type PreJoinSelection } from "./PreJoinScreen.js";

function useRoomsStore<T>(store: ReturnType<typeof createRoomsStore>, selector: (s: RoomsState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()), () => selector(store.getState()));
}

type Phase =
  | { kind: "lobby" }
  | { kind: "prejoin"; roomId: string }
  | { kind: "inroom"; roomId: string; selection: PreJoinSelection };

// Local copy of the designer's kbd inline style. We'll lift this to a shared
// place once InRoomScreen also needs it.
const kbdStyle: CSSProperties = {
  display: "inline-block",
  padding: "1px 6px",
  border: "1px solid var(--border-strong)",
  borderRadius: 4,
  background: "var(--bg-elev-2)",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  color: "var(--text)",
};

function initialsFromName(name: string): string {
  return name.split(" ").map((s) => s[0] ?? "").slice(0, 2).join("").toUpperCase() || "?";
}

// Stable 1..5 tone bucket from a room id so list avatars get consistent colors.
function avatarTone(id: string): 1 | 2 | 3 | 4 | 5 {
  return ((id.charCodeAt(0) % 5) + 1) as 1 | 2 | 3 | 4 | 5;
}

function hostLabel(serverUrl: string): string {
  try {
    return new URL(serverUrl).host;
  } catch {
    return serverUrl;
  }
}

function Stat({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: string;
  tone?: "live";
  mono?: boolean;
}): ReactElement {
  return (
    <div
      style={{
        padding: "var(--s-3) var(--s-4)",
        background: "color-mix(in oklch, var(--bg-elev) 60%, transparent)",
        border: "1px solid var(--border-soft)",
        borderRadius: "var(--r-md)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {tone === "live" && (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--rv-live)",
              boxShadow: "0 0 8px var(--rv-live)",
            }}
          />
        )}
        <span className="rv-label" style={{ fontSize: "var(--t-2xs)" }}>{label}</span>
      </div>
      <span className={mono ? "rv-mono" : ""} style={{ fontSize: "var(--t-base)", color: "var(--text)" }}>
        {value}
      </span>
    </div>
  );
}

export function LobbyScreen(): ReactElement {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const token = useAuthStore((s) => s.token);
  const serverUrl = useAuthStore((s) => s.serverUrl);

  const store = useMemo(() => {
    const api = new ApiClient(serverUrl);
    api.setToken(token);
    return createRoomsStore(api);
  }, [serverUrl, token]);

  const owned = useRoomsStore(store, (s) => s.owned);
  const recent = useRoomsStore(store, (s) => s.recent);
  const status = useRoomsStore(store, (s) => s.status);
  const error = useRoomsStore(store, (s) => s.error);
  const activeRoomId = useRoomsStore(store, (s) => s.activeRoomId);

  const [phase, setPhase] = useState<Phase>({ kind: "lobby" });
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const [dmInboxOpen, setDmInboxOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    void store.getState().refresh();
  }, [store]);

  useEffect(() => {
    if (activeRoomId && phase.kind === "lobby") {
      setPhase({ kind: "prejoin", roomId: activeRoomId });
    }
  }, [activeRoomId, phase.kind]);

  // Deep-link consumer: redvoice://join/<uuid> → auto-open the prejoin flow.
  // Preload replays any queued event on subscribe, so cold-start with a
  // restored session also works.
  useEffect(() => {
    return window.redvoice.onDeepLink((link) => {
      if (link.type === "join-room") {
        void store.getState().join(link.roomId);
      }
    });
  }, [store]);

  const [newRoomName, setNewRoomName] = useState("");
  const [joinInput, setJoinInput] = useState("");

  // Periodic health probe — drives the "connected" badge in the top bar.
  // Validates response body so ISP NXDOMAIN redirects don't show green.
  const [online, setOnline] = useState<"checking" | "ok" | "down">("checking");
  useEffect(() => {
    let cancelled = false;
    const probe = async (): Promise<void> => {
      try {
        const res = await fetch(`${serverUrl.replace(/\/$/, "")}/health`);
        if (cancelled) return;
        if (!res.ok) return setOnline("down");
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("application/json")) return setOnline("down");
        const body = (await res.json()) as { status?: string };
        if (!cancelled) setOnline(body.status === "ok" ? "ok" : "down");
      } catch {
        if (!cancelled) setOnline("down");
      }
    };
    void probe();
    const interval = setInterval(() => void probe(), 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [serverUrl]);

  async function onCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    await store.getState().create(newRoomName.trim());
    setNewRoomName("");
  }

  async function onJoin(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!joinInput.trim()) return;
    await store.getState().join(joinInput.trim());
  }

  if (phase.kind === "prejoin") {
    return (
      <PreJoinScreen
        roomId={phase.roomId}
        onJoin={(selection) => setPhase({ kind: "inroom", roomId: phase.roomId, selection })}
        onCancel={() => {
          store.getState().clearActive();
          setPhase({ kind: "lobby" });
        }}
      />
    );
  }

  if (phase.kind === "inroom") {
    return (
      <InRoomScreen
        roomId={phase.roomId}
        selection={phase.selection}
        onLeave={() => {
          store.getState().clearActive();
          setPhase({ kind: "lobby" });
        }}
      />
    );
  }

  const avatarInitial = user?.displayName?.[0]?.toUpperCase() ?? "?";
  const displayName = user?.displayName ?? "";
  const quickChips = ["Quick chat", "Stream night", "1:1", "Listening party"];

  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr", height: "100%" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--s-3) var(--s-6)",
          borderBottom: "1px solid var(--border-soft)",
          background: "color-mix(in oklch, var(--rv-ink-0) 30%, transparent)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)" }}>
          <I.Logo size={24} />
          <span style={{ fontWeight: 700, letterSpacing: "-0.01em", fontSize: "var(--t-md)" }}>RedVoice</span>
          <span
            className="rv-badge"
            data-tone={online === "ok" ? "live" : online === "down" ? "red" : "amber"}
            style={{ marginLeft: "var(--s-3)" }}
          >
            <span className="pip" />{" "}
            {online === "checking" ? "connecting…" : online === "ok" ? "connected" : "offline"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--s-2)",
              padding: "0 var(--s-3)",
              height: "2rem",
              border: "1px solid var(--border-soft)",
              borderRadius: "var(--r-pill)",
              background: "color-mix(in oklch, var(--bg-elev) 80%, transparent)",
            }}
          >
            <span className="rv-avatar" style={{ width: 22, height: 22, fontSize: 10 }}>
              {avatarInitial}
            </span>
            <span style={{ fontSize: "var(--t-sm)" }}>{displayName}</span>
          </div>
          <button className="rv-btn" data-variant="ghost" onClick={() => setDmInboxOpen(true)}>
            <I.Chat size={14} /> DMs
          </button>
          <button className="rv-btn" data-variant="ghost" onClick={() => setFeaturesOpen(true)}>
            <I.Star size={14} /> Changelog
          </button>
          <button
            className="rv-btn rv-btn-icon"
            data-variant="ghost"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
          >
            <I.Settings size={16} />
          </button>
          <button
            className="rv-btn rv-btn-icon"
            data-variant="ghost"
            onClick={() => void logout()}
            aria-label="Log out"
          >
            <I.Logout size={16} />
          </button>
        </div>
      </header>

      <div
        className="rv-scroll"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(260px, 320px) 1fr",
          gap: "var(--s-7)",
          padding: "var(--s-7)",
          overflow: "auto",
        }}
      >
        <aside style={{ display: "flex", flexDirection: "column", gap: "var(--s-6)" }}>
          <div>
            <div className="rv-section-head">
              <span className="rv-label">My rooms</span>
              <span
                className="rv-mono"
                style={{ fontSize: "var(--t-2xs)", color: "var(--text-faint)" }}
              >
                {owned.length}
              </span>
            </div>
            {owned.length === 0 ? (
              <div
                style={{
                  color: "var(--text-dim)",
                  fontSize: "var(--t-sm)",
                  padding: "var(--s-3)",
                }}
              >
                None yet.
              </div>
            ) : (
              <div className="rv-list">
                {owned.map((r) => (
                  <div
                    key={r.id}
                    className="rv-list-item"
                    onClick={() => void store.getState().join(r.id)}
                  >
                    <span
                      className="rv-avatar"
                      data-tone={avatarTone(r.id)}
                      style={{ width: 28, height: 28, fontSize: 11 }}
                    >
                      {initialsFromName(r.name)}
                    </span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 500, fontSize: "var(--t-sm)" }}>{r.name}</span>
                      </span>
                      <span
                        className="rv-mono"
                        style={{ fontSize: "var(--t-2xs)", color: "var(--text-faint)" }}
                      >
                        {r.id.slice(0, 8)}…
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="rv-section-head">
              <span className="rv-label">Recent</span>
            </div>
            {recent.length === 0 ? (
              <div
                style={{
                  color: "var(--text-dim)",
                  fontSize: "var(--t-sm)",
                  padding: "var(--s-3)",
                }}
              >
                No recent rooms.
              </div>
            ) : (
              <div className="rv-list">
                {recent.map((r) => (
                  <div
                    key={r.id}
                    className="rv-list-item"
                    onClick={() => void store.getState().join(r.id)}
                  >
                    <I.Clock size={14} style={{ color: "var(--text-faint)" }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <span style={{ fontSize: "var(--t-sm)" }}>{r.name}</span>
                      <span
                        className="rv-mono"
                        style={{ fontSize: "var(--t-2xs)", color: "var(--text-faint)" }}
                      >
                        {r.id.slice(0, 8)}…
                      </span>
                    </div>
                    <I.Chevron size={14} style={{ color: "var(--text-faint)" }} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            style={{
              marginTop: "auto",
              padding: "var(--s-4)",
              border: "1px dashed var(--border)",
              borderRadius: "var(--r-md)",
              color: "var(--text-dim)",
              fontSize: "var(--t-xs)",
              lineHeight: 1.55,
            }}
          >
            <div
              className="rv-mono"
              style={{
                textTransform: "uppercase",
                letterSpacing: ".14em",
                fontSize: "var(--t-2xs)",
                marginBottom: 6,
                color: "var(--text)",
              }}
            >
              tip · keybind
            </div>
            Push-to-talk binds in <kbd style={kbdStyle}>{MOD_KEY}</kbd> <kbd style={kbdStyle}>,</kbd> →&nbsp;Keybinds.
          </div>
        </aside>

        <main style={{ display: "flex", flexDirection: "column", gap: "var(--s-6)", maxWidth: "44rem" }}>
          <section className="rv-card" data-glow="true" style={{ padding: "var(--s-7)" }}>
            <div>
              <div
                className="rv-headline"
                style={{ fontSize: "var(--t-2xl)", marginBottom: "var(--s-2)" }}
              >
                Spin up a room.
              </div>
              <p style={{ color: "var(--text-mid)", margin: 0, marginBottom: "var(--s-5)" }}>
                Persistent. Shareable link. Anyone with the URL can join — kick or password-lock from inside.
              </p>

              <form
                onSubmit={onCreate}
                style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--s-3)" }}
              >
                <input
                  className="rv-input"
                  placeholder="Room name — e.g. Studio Floor"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  style={{ height: "2.75rem" }}
                />
                <button
                  className="rv-btn"
                  data-variant="primary"
                  type="submit"
                  disabled={!newRoomName.trim()}
                  style={{ height: "2.75rem", padding: "0 var(--s-5)" }}
                >
                  <I.Plus size={16} /> Create
                </button>
              </form>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "var(--s-2)",
                  marginTop: "var(--s-4)",
                }}
              >
                {quickChips.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="rv-btn"
                    data-variant="ghost"
                    style={{
                      height: "1.9rem",
                      fontSize: "var(--t-xs)",
                      border: "1px solid var(--border-soft)",
                      color: "var(--text-mid)",
                    }}
                    onClick={() => setNewRoomName(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="rv-card" style={{ padding: "var(--s-6)" }}>
            <div className="rv-section-head" style={{ marginBottom: "var(--s-4)" }}>
              <I.Link size={14} style={{ color: "var(--text-mid)" }} />
              <span className="rv-label">Join by link or id</span>
            </div>
            <form
              onSubmit={onJoin}
              style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--s-3)" }}
            >
              <input
                className="rv-input"
                placeholder="voice.r3dwolfie.com/join/… or room id"
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value)}
              />
              <button
                className="rv-btn"
                type="submit"
                disabled={!joinInput.trim()}
                data-variant={joinInput ? "primary" : undefined}
              >
                Open room <I.Chevron size={14} />
              </button>
            </form>
            <p
              style={{
                marginTop: "var(--s-3)",
                color: "var(--text-faint)",
                fontSize: "var(--t-xs)",
              }}
            >
              <span className="rv-mono">redvoice://</span> deep-links also supported.
            </p>
          </section>

          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "var(--s-3)",
            }}
          >
            <Stat label="Server" value={hostLabel(serverUrl)} tone="live" />
            <Stat label="RTT" value="—" mono />
            <Stat label="Build" value="0.1.5" />
          </section>

          {status === "loading" && (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--s-2)",
                alignSelf: "flex-start",
                padding: "var(--s-2) var(--s-3)",
                border: "1px solid var(--border-soft)",
                borderRadius: "var(--r-pill)",
                background: "color-mix(in oklch, var(--bg-elev) 60%, transparent)",
                color: "var(--text-dim)",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--t-xs)",
              }}
            >
              <Spinner /> loading…
            </div>
          )}

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
        </main>
      </div>

      {featuresOpen && <FeaturesPanel onClose={() => setFeaturesOpen(false)} />}
      <DmInboxModal open={dmInboxOpen} onClose={() => setDmInboxOpen(false)} />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
