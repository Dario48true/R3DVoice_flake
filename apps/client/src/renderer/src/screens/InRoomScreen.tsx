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
import { usePrefs } from "../lib/prefs-singleton.js";
import { CopyLinkButton } from "../components/CopyLinkButton.js";

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
  onDoubleClick(id: string, videoEl: HTMLVideoElement | null): void;
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
    // HiDPI: declare the source's intrinsic size so CSS `object-fit` can scale
    // without upscaling blur. Track settings may not be available immediately,
    // so re-check once after attach.
    const applyDimensions = (): void => {
      const settings = track.mediaStreamTrack.getSettings();
      if (settings.width && settings.height) {
        el.width = settings.width;
        el.height = settings.height;
      }
    };
    applyDimensions();
    const retry = setTimeout(applyDimensions, 500);
    return () => {
      clearTimeout(retry);
      track.detach(el);
    };
  }, [p.screenTrack]);

  function onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    callbacks.onContextMenu(p.id, e.clientX, e.clientY);
  }

  function onDoubleClick(): void {
    callbacks.onDoubleClick(p.id, videoRef.current);
  }

  return (
    <div
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      style={{
        background: "var(--bg-elev)",
        border: `2px solid ${p.isSpeaking ? "var(--accent)" : "var(--border)"}`,
        borderRadius: maximized ? 0 : 8,
        padding: p.screenTrack ? 0 : 16,
        minHeight: maximized ? 0 : 180,
        height: maximized ? "100%" : undefined,
        width: maximized ? "100%" : undefined,
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
      title="Double-click to fullscreen · right-click for volume"
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
  const [voiceVolumes, setVoiceVolumes] = useState<Record<string, number>>({});
  const [screenVolumes, setScreenVolumes] = useState<Record<string, number>>({});
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

  const prefMic = usePrefs((s) => s.micDeviceId);
  useEffect(() => {
    if (conn.phase === "connected" && prefMic) {
      void roomWrapper.room.switchActiveDevice("audioinput", prefMic);
    }
  }, [prefMic, conn.phase, roomWrapper]);

  const prefSpeaker = usePrefs((s) => s.speakerDeviceId);
  useEffect(() => {
    if (conn.phase === "connected" && prefSpeaker) {
      void roomWrapper.room.switchActiveDevice("audiooutput", prefSpeaker);
    }
  }, [prefSpeaker, conn.phase, roomWrapper]);

  useEffect(() => {
    const cleanup = window.redvoice.onPttEvent((pressed) => {
      void roomWrapper.setMuted(!pressed);
    });
    return cleanup;
  }, [roomWrapper]);

  // ESC closes maximize / menu.
  // Left-click (button 0) outside the menu closes it — ignore right-clicks
  // and middle-clicks so the menu doesn't close the moment it opens.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        setMaximizedId(null);
        setMenu(null);
      }
    }
    function onMouseDown(e: globalThis.MouseEvent): void {
      if (e.button !== 0) return;
      setMenu(null);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, []);

  // Sync maximizedId with the browser fullscreen state: if user presses ESC or
  // exits OS fullscreen by other means, clear our maximized state too.
  useEffect(() => {
    function onFsChange(): void {
      if (!document.fullscreenElement) {
        setMaximizedId(null);
      }
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  async function handleLeave(): Promise<void> {
    await roomWrapper.leave();
    props.onLeave();
  }

  async function handleToggleScreen(): Promise<void> {
    const isSharing = hasScreenShare(snapshot.local);
    await roomWrapper.setScreenShare(!isSharing);
  }

  function setVoiceVolume(id: string, volume: number): void {
    setVoiceVolumes((prev) => ({ ...prev, [id]: volume }));
    const participant = snapshot.remotes.find((r) => r.identity === id);
    if (participant) {
      participant.setVolume(volume, Track.Source.Microphone);
    }
  }

  function setScreenVolume(id: string, volume: number): void {
    setScreenVolumes((prev) => ({ ...prev, [id]: volume }));
    const participant = snapshot.remotes.find((r) => r.identity === id);
    if (participant) {
      participant.setVolume(volume, Track.Source.ScreenShareAudio);
    }
  }

  const tileCallbacks: TileCallbacks = {
    onDoubleClick: (id, videoEl) => {
      // If the tile has a <video> element and isn't already fullscreen,
      // request true OS-level fullscreen on it. Otherwise toggle the in-app
      // maximize (useful for avatar-only tiles).
      if (videoEl && !document.fullscreenElement) {
        setMaximizedId(id);
        void videoEl.requestFullscreen().catch(() => {
          // Fallback to in-app maximize if OS fullscreen refused
        });
        return;
      }
      if (document.fullscreenElement) {
        void document.exitFullscreen();
        return;
      }
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
  const sharingParticipants = tiles.filter((t) => t.screenTrack !== null);
  const maximizedTile = maximizedId ? tiles.find((t) => t.id === maximizedId) : null;
  const menuParticipant = menu ? tiles.find((t) => t.id === menu.participantId) : null;
  const menuParticipantName = menuParticipant?.name ?? "participant";
  const menuIsLocal = menuParticipant?.isLocal ?? false;

  // Full-viewport maximized layout — no sidebar/topbar/control bar, single tile
  // fills the whole app window. OS fullscreen (requestFullscreen) is preferred
  // when the tile has a video; this layout is the fallback for avatar tiles or
  // when OS fullscreen is unavailable.
  if (maximizedTile && !document.fullscreenElement) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "black",
          display: "flex",
          flexDirection: "column",
          zIndex: 500,
        }}
      >
        <div style={{ flex: 1, minHeight: 0 }}>
          <ParticipantTile p={maximizedTile} maximized callbacks={tileCallbacks} />
        </div>
        <button
          onClick={() => setMaximizedId(null)}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "rgba(0,0,0,0.7)",
            border: "1px solid var(--border)",
            color: "white",
            borderRadius: 6,
            padding: "6px 14px",
            cursor: "pointer",
            font: "inherit",
            zIndex: 501,
          }}
        >
          ✕ Exit (ESC)
        </button>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="topbar">
        <strong>RedVoice — In room</strong>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-dim)" }}>
          {conn.phase === "connecting" && <span>Connecting…</span>}
          {conn.phase === "connected" && <span>{tiles.length} participant(s)</span>}
          {conn.phase === "error" && <span>Error: {conn.message}</span>}
          {sharingParticipants.length > 0 && (
            <button
              className="btn secondary"
              style={{ padding: "4px 10px", fontSize: 12 }}
              onClick={() => {
                const first = sharingParticipants[0];
                if (first) setMaximizedId(first.id);
              }}
              title="Click to focus"
            >
              👁 {sharingParticipants.map((s) => s.name).join(", ")} sharing
            </button>
          )}
          <CopyLinkButton roomId={props.roomId} serverUrl={serverUrl} />
          <button
            className="btn secondary"
            style={{ padding: "4px 8px" }}
            onClick={() => setSettingsOpen(true)}
            title="Settings"
          >
            ⚙
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <aside
          style={{
            width: 200,
            background: "var(--bg-elev)",
            borderRight: "1px solid var(--border)",
            overflowY: "auto",
            padding: 12,
            flexShrink: 0,
          }}
        >
          <div className="section-title">Participants</div>
          <ul className="room-list">
            {tiles.map((p) => (
              <li key={p.id}>
                <button onClick={() => setMaximizedId(p.id)}>
                  {p.name}{p.isLocal && " (you)"}
                  {p.screenTrack && <span style={{ color: "var(--accent)", marginLeft: 6 }}>●</span>}
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <div style={{ padding: 24, flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
          {conn.phase === "error" && <div className="error">{conn.message}</div>}
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
        </div>
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
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            left: menu.x,
            top: menu.y,
            background: "var(--bg-elev)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: 12,
            minWidth: 240,
            zIndex: 1000,
            boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>
            {menuParticipantName}{menuIsLocal && " (you)"}
          </div>

          {menuIsLocal ? (
            <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5 }}>
              You can't adjust your own volume. Right-click someone else's tile
              to change their voice or screen audio level.
            </div>
          ) : (
            <>
              <VolumeRow
                label="Voice"
                value={voiceVolumes[menu.participantId] ?? 1}
                onChange={(v) => setVoiceVolume(menu.participantId, v)}
              />
              <VolumeRow
                label="Screen audio"
                value={screenVolumes[menu.participantId] ?? 1}
                onChange={(v) => setScreenVolume(menu.participantId, v)}
              />
            </>
          )}
        </div>
      )}

      <div ref={audioMountRef} style={{ display: "none" }} aria-hidden="true" />
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function VolumeRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}): ReactElement {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
        <span>{label}</span>
        <span>{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={2}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%" }}
      />
    </div>
  );
}
