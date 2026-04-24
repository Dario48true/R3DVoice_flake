import { useEffect, useMemo, useState, useSyncExternalStore, type FormEvent, type ReactElement } from "react";
import { ApiClient } from "../lib/api.js";
import { createRoomsStore, type RoomsState } from "../lib/rooms-store.js";
import { useAuthStore } from "../lib/auth-context.js";
import { FeaturesPanel } from "../components/FeaturesPanel.js";
import { InRoomScreen } from "./InRoomScreen.js";
import { PreJoinScreen, type PreJoinSelection } from "./PreJoinScreen.js";

function useRoomsStore<T>(store: ReturnType<typeof createRoomsStore>, selector: (s: RoomsState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()), () => selector(store.getState()));
}

type Phase =
  | { kind: "lobby" }
  | { kind: "prejoin"; roomId: string }
  | { kind: "inroom"; roomId: string; selection: PreJoinSelection };

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

  useEffect(() => {
    void store.getState().refresh();
  }, [store]);

  // When the rooms-store sets activeRoomId (user clicked a room), transition to prejoin.
  useEffect(() => {
    if (activeRoomId && phase.kind === "lobby") {
      setPhase({ kind: "prejoin", roomId: activeRoomId });
    }
  }, [activeRoomId, phase.kind]);

  const [newRoomName, setNewRoomName] = useState("");
  const [joinInput, setJoinInput] = useState("");

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

  return (
    <div className="app">
      <div className="topbar">
        <strong>RedVoice</strong>
        <span style={{ color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 8 }}>
          {user?.displayName}
          <button
            className="btn secondary"
            style={{ padding: "4px 10px" }}
            onClick={() => setFeaturesOpen(true)}
            title="Changelog & roadmap"
          >
            📋 Changelog
          </button>
          <button className="btn secondary" style={{ padding: "4px 8px" }} onClick={() => void logout()}>
            Log out
          </button>
        </span>
      </div>

      <div className="lobby">
        <aside>
          <div className="section-title">My rooms</div>
          {owned.length === 0 ? (
            <div style={{ color: "var(--text-dim)" }}>None yet.</div>
          ) : (
            <ul className="room-list">
              {owned.map((r) => (
                <li key={r.id}>
                  <button onClick={() => void store.getState().join(r.id)}>{r.name}</button>
                </li>
              ))}
            </ul>
          )}

          <div className="section-title">Recent</div>
          {recent.length === 0 ? (
            <div style={{ color: "var(--text-dim)" }}>No recent rooms.</div>
          ) : (
            <ul className="room-list">
              {recent.map((r) => (
                <li key={r.id}>
                  <button onClick={() => void store.getState().join(r.id)}>{r.name}</button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main>
          <form className="form" onSubmit={onCreate}>
            <div className="section-title">Create a room</div>
            <input
              placeholder="Room name"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
            />
            <button className="btn" type="submit" disabled={!newRoomName.trim()}>
              Create
            </button>
          </form>

          <form className="form" onSubmit={onJoin}>
            <div className="section-title">Join by link or id</div>
            <input
              placeholder="voice.R3dWolfie.com/join/... or room id"
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
            />
            <button className="btn secondary" type="submit" disabled={!joinInput.trim()}>
              Open room
            </button>
          </form>

          {status === "loading" && <div style={{ color: "var(--text-dim)" }}>Loading…</div>}
          {error && <div className="error">{error}</div>}
        </main>
      </div>

      {featuresOpen && <FeaturesPanel onClose={() => setFeaturesOpen(false)} />}
    </div>
  );
}
