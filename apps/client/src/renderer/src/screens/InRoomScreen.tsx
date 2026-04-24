import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactElement } from "react";
import { ApiClient } from "../lib/api.js";
import { useAuthStore } from "../lib/auth-context.js";
import { openMicStream } from "../lib/media.js";
import {
  LiveKitRoom,
  RoomEvent,
  Track,
  type LocalParticipant,
  type RemoteParticipant,
  type RoomStateSnapshot,
} from "../lib/livekit-room.js";
import type { PreJoinSelection } from "./PreJoinScreen.js";
import { SettingsModal } from "../components/SettingsModal.js";

export interface InRoomScreenProps {
  roomId: string;
  selection: PreJoinSelection;
  onLeave(): void;
}

interface ConnectionState {
  phase: "connecting" | "connected" | "error";
  message?: string;
}

interface ParticipantView {
  id: string;
  name: string;
  isSpeaking: boolean;
  isLocal: boolean;
  screenTrack: Track | null;
}

interface TileCallbacks {
  onDoubleClick(id: string): void;
  onContextMenu(id: string, x: number, y: number): void;
}

function ParticipantTile({
  p,
  maximized,
  callbacks,
}: {
  p: ParticipantView;
  maximized: boolean;
  callbacks: TileCallbacks;
}): ReactElement {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    const track = p.screenTrack;
    if (!el || !track) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [p.screenTrack]);

  function onContextMenu(e: MouseEvent): void {
    if (p.isLocal) return;
    e.preventDefault();
    callbacks.onContextMenu(p.id, e.clientX, e.clientY);
  }

  return (
    <div
      onDoubleClick={() => callbacks.onDoubleClick(p.id)}
      onContextMenu={onContextMenu}
      style={{
        background: "var(--bg-elev)",
        border: `2px solid ${p.isSpeaking ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 8,
        padding: p.screenTrack ? 0 : 16,
        minHeight: maximized ? 0 : 180,
        height: maximized ? "100%" : undefined,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        transition: "border-color 120ms linear",
        overflow: "hidden",
        position: "relative",
        cursor: "pointer",
      }}
      title="Double-click to maximize · right-click for volume"
    >
      {p.screenTrack ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={p.isLocal}
            style={{ width: "100%", height: "100%", objectFit: "contain", background: "black" }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 8,
              left: 8,
              background: "rgba(0,0,0,0.6)",
              padding: "4px 8px",
              borderRadius: 4,
              fontSize: 12,
            }}
          >
            {p.name}
            {p.isLocal && <span style={{ color: "var(--text-dim)" }}> (you)</span>}
          </div>
        </>
      ) : (
        <>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
            }}
          >
            {p.name.charAt(0).toUpperCase() || "?"}
          </div>
          <div>
            {p.name}
            {p.isLocal && <span style={{ color: "var(--text-dim)" }}> (you)</span>}
          </div>
        </>
      )}
    </div>
  );
}

function findScreenTrack(p: LocalParticipant | RemoteParticipant): Track | null {
  for (const pub of p.trackPublications.values()) {
    if (pub.source === Track.Source.ScreenShare && pub.track) {
      return pub.track;
    }
  }
  return null;
}

function hasScreenShare(p: LocalParticipant | null): boolean {
  if (!p) return false;
  for (const pub of p.trackPublications.values()) {
    if (pub.source === Track.Source.ScreenShare) return true;
  }
  return false;
}

interface VolumeMenu {
  participantId: string;
  x: number;
  y: number;
}

export function InRoomScreen(props: InRoomScreenProps): ReactElement {
  const token = useAuthStore((s) => s.token);
  const serverUrl = useAuthStore((s) => s.serverUrl);

  const roomWrapper = useMemo(() => new LiveKitRoom(), []);
  const [conn, setConn] = useState<ConnectionState>({ phase: "connecting" });
  const [maximizedId, setMaximizedId] = useState<string | null>(null);
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [menu, setMenu] = useState<VolumeMenu | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const snapshot: RoomStateSnapshot = useSyncExternalStore(
    (cb) => roomWrapper.subscribe(() => cb()),
    () => roomWrapper.snapshot(),
    () => roomWrapper.snapshot(),
  );

  const audioMountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const api = new ApiClient(serverUrl);
        api.setToken(token);
        const { token: lkToken, url } = await api.mintLiveKitToken(props.roomId);
        if (cancelled) return;
        // Plan 4 Task 5 hypothesis #1: Plan 3's `dynacast: false` should've
        // eliminated the codec collision. Publish mic audio again.
        const micStream = props.selection.micDeviceId
          ? await openMicStream(props.selection.micDeviceId)
          : undefined;

        await roomWrapper.join({
          wsUrl: url,
          token: lkToken,
          ...(micStream !== undefined && { micStream }),
          publishAudio: true,
          publishScreen: props.selection.publishScreen,
          screenQuality: props.selection.screenQuality,
        });
        if (!cancelled) setConn({ phase: "connected" });
      } catch (err) {
        if (cancelled) return;
        setConn({
          phase: "error",
          message: err instanceof Error ? err.message : "failed to connect",
        });
      }
    })();
    return () => {
      cancelled = true;
      void roomWrapper.leave();
    };
  }, [roomWrapper, props.roomId, props.selection, token, serverUrl]);

  useEffect(() => {
    const room = roomWrapper.room;
    const mount = audioMountRef.current;
    if (!mount) return;

    const onTrackSubscribed = (track: Track): void => {
      if (track.kind !== Track.Kind.Audio) return;
      const el = track.attach() as HTMLAudioElement;
      el.autoplay = true;
      (el as HTMLElement & { playsInline?: boolean }).playsInline = true;
      mount.appendChild(el);
    };
    const onTrackUnsubscribed = (track: Track): void => {
      if (track.kind !== Track.Kind.Audio) return;
      track.detach().forEach((el) => el.remove());
    };

    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    return () => {
      room.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    };
  }, [roomWrapper]);

  // ESC closes maximize / menu; click-outside closes menu.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        setMaximizedId(null);
        setMenu(null);
      }
    }
    function onClick(): void {
      setMenu(null);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
    };
  }, []);

  async function handleLeave(): Promise<void> {
    await roomWrapper.leave();
    props.onLeave();
  }

  async function handleToggleScreen(): Promise<void> {
    const isSharing = hasScreenShare(snapshot.local);
    await roomWrapper.setScreenShare(!isSharing);
  }

  function setParticipantVolume(id: string, volume: number): void {
    setVolumes((prev) => ({ ...prev, [id]: volume }));
    const participant = snapshot.remotes.find((r) => r.identity === id);
    if (participant) {
      participant.setVolume(volume);
    }
  }

  const tileCallbacks: TileCallbacks = {
    onDoubleClick: (id) => {
      setMaximizedId((current) => (current === id ? null : id));
    },
    onContextMenu: (id, x, y) => {
      setMenu({ participantId: id, x, y });
    },
  };

  const tiles: ParticipantView[] = [];
  if (snapshot.local) {
    tiles.push({
      id: snapshot.local.identity,
      name: snapshot.local.name || snapshot.local.identity,
      isSpeaking: snapshot.local.isSpeaking,
      isLocal: true,
      screenTrack: findScreenTrack(snapshot.local),
    });
  }
  for (const remote of snapshot.remotes as RemoteParticipant[]) {
    tiles.push({
      id: remote.identity,
      name: remote.name || remote.identity,
      isSpeaking: remote.isSpeaking,
      isLocal: false,
      screenTrack: findScreenTrack(remote),
    });
  }

  const sharing = hasScreenShare(snapshot.local);
  const muted = !(snapshot.local?.isMicrophoneEnabled ?? true);
  const maximizedTile = maximizedId ? tiles.find((t) => t.id === maximizedId) : null;
  const menuParticipantName = menu
    ? (tiles.find((t) => t.id === menu.participantId)?.name ?? "participant")
    : "";

  return (
    <div className="app">
      <div className="topbar">
        <strong>RedVoice — In room</strong>
        <span style={{ color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 8 }}>
          {conn.phase === "connecting" && "Connecting…"}
          {conn.phase === "connected" && `${tiles.length} participant(s)`}
          {conn.phase === "error" && `Error: ${conn.message}`}
          <button
            className="btn secondary"
            style={{ padding: "4px 8px" }}
            onClick={() => setSettingsOpen(true)}
            title="Settings"
          >
            ⚙
          </button>
        </span>
      </div>

      <div style={{ padding: 24, flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        {conn.phase === "error" && <div className="error">{conn.message}</div>}
        {maximizedTile ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <ParticipantTile p={maximizedTile} maximized callbacks={tileCallbacks} />
            <div style={{ color: "var(--text-dim)", marginTop: 8, fontSize: 12 }}>
              Double-click again or press ESC to exit fullscreen
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 12,
            }}
          >
            {tiles.map((p) => (
              <ParticipantTile key={p.id} p={p} maximized={false} callbacks={tileCallbacks} />
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          borderTop: "1px solid var(--border)",
          background: "var(--bg-elev)",
          padding: 12,
          display: "flex",
          gap: 8,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <button
          className={`btn ${muted ? "" : "secondary"}`}
          onClick={() => void roomWrapper.setMuted(!muted)}
          disabled={conn.phase !== "connected"}
        >
          {muted ? "Unmute" : "Mute"}
        </button>
        <button
          className={`btn ${sharing ? "" : "secondary"}`}
          onClick={() => void handleToggleScreen()}
          disabled={conn.phase !== "connected"}
        >
          {sharing ? "Stop sharing" : "Share screen"}
        </button>
        <button className="btn secondary" onClick={() => void handleLeave()}>
          Leave
        </button>
      </div>

      {menu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            left: menu.x,
            top: menu.y,
            background: "var(--bg-elev)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: 12,
            minWidth: 220,
            zIndex: 1000,
            boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 8 }}>
            Volume — {menuParticipantName}
          </div>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={volumes[menu.participantId] ?? 1}
            onChange={(e) => setParticipantVolume(menu.participantId, Number(e.target.value))}
            style={{ width: "100%" }}
          />
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
            {Math.round((volumes[menu.participantId] ?? 1) * 100)}%
          </div>
        </div>
      )}

      <div ref={audioMountRef} style={{ display: "none" }} aria-hidden="true" />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
