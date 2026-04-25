import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
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
import { I } from "../components/Icons.js";
import { Spinner } from "../components/Primitives.js";
import { RoomChatPanel } from "../components/RoomChatPanel.js";

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
  muted: boolean;
  screenTrack: Track | null;
}

interface TileCallbacks {
  onDoubleClick(id: string, videoEl: HTMLVideoElement | null): void;
  onContextMenu(id: string, x: number, y: number): void;
}

interface VolumeMenu {
  participantId: string;
  x: number;
  y: number;
}

type LayoutMode = "auto" | "grid" | "speaker";

// Designer's kbd inline style — duplicated locally; will lift in a refactor.
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

function fmtTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h > 0 ? String(h).padStart(2, "0") + ":" : ""}${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// Stable 1..5 avatar tone bucket from id.
function toneOf(id: string): 1 | 2 | 3 | 4 | 5 {
  return ((id.charCodeAt(0) % 5) + 1) as 1 | 2 | 3 | 4 | 5;
}

// Decorative per-participant latency until Phase 5 T8 wires real network quality.
function latencyOf(id: string): number {
  return 30 + (id.charCodeAt(0) % 60);
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

// Best-effort remote-mic-muted check via audio publication state. Defaults to
// false when no audio publication is found (e.g. remote with no mic published).
function isRemoteMuted(p: RemoteParticipant): boolean {
  for (const pub of p.trackPublications.values()) {
    if (pub.source === Track.Source.Microphone) {
      return pub.isMuted;
    }
  }
  return false;
}

function MiniVu({ active }: { active: boolean }): ReactElement {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 14 }}>
      {[0.4, 0.7, 1, 0.55].map((h, i) => (
        <span
          key={i}
          style={{
            width: 2,
            height: `${h * 100}%`,
            background: active ? "var(--rv-live)" : "var(--rv-ink-400)",
            borderRadius: 1,
            animation: active ? `rv-vu-bar 0.${6 + i}s ease-in-out infinite alternate` : "none",
            animationDelay: `${i * 0.05}s`,
            boxShadow: active ? "0 0 4px var(--rv-live)" : "none",
          }}
        />
      ))}
    </div>
  );
}

function NetMeter({ latency }: { latency: number }): ReactElement {
  const bars = latency < 50 ? 4 : latency < 100 ? 3 : 2;
  const tone = latency < 50 ? "var(--rv-live)" : latency < 100 ? "var(--rv-amber)" : "var(--accent)";
  return (
    <span style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 14, padding: "0 6px" }}>
      {[6, 9, 12, 15].map((h, i) => (
        <span
          key={i}
          style={{
            width: 3,
            height: h,
            background: i < bars ? tone : "var(--rv-ink-400)",
            borderRadius: 1,
            opacity: i < bars ? 1 : 0.4,
          }}
        />
      ))}
    </span>
  );
}

function KV({ label, value }: { label: string; value: ReactNode }): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "4px 0",
        fontSize: "var(--t-xs)",
      }}
    >
      <span
        style={{
          color: "var(--text-faint)",
          fontFamily: "var(--font-mono)",
          textTransform: "uppercase",
          letterSpacing: ".1em",
          fontSize: 10,
        }}
      >
        {label}
      </span>
      <span style={{ color: "var(--text-mid)" }}>{value}</span>
    </div>
  );
}

function CtxItem({
  children,
  danger,
  onClick,
  title,
}: {
  children: ReactNode;
  danger?: boolean;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  title?: string;
}): ReactElement {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "6px 8px",
        borderRadius: 6,
        border: 0,
        background: "transparent",
        cursor: "pointer",
        color: danger ? "var(--accent-glow)" : "var(--text)",
        fontSize: "var(--t-sm)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "color-mix(in oklch, var(--accent) 14%, transparent)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

function Tile({
  tile,
  big,
  callbacks,
}: {
  tile: ParticipantView;
  big: boolean;
  callbacks: TileCallbacks;
}): ReactElement {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sharing = tile.screenTrack !== null;

  useEffect(() => {
    const el = videoRef.current;
    const track = tile.screenTrack;
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
  }, [tile.screenTrack]);

  function onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    callbacks.onContextMenu(tile.id, e.clientX, e.clientY);
  }

  function onDoubleClick(): void {
    callbacks.onDoubleClick(tile.id, videoRef.current);
  }

  return (
    <div
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      title="Double-click to fullscreen · right-click for volume"
      className={sharing ? "rv-scanlines" : ""}
      style={{
        position: "relative",
        aspectRatio: big ? "16/9" : "16/10",
        borderRadius: "var(--r-lg)",
        background: sharing
          ? "linear-gradient(180deg, oklch(0.18 0.04 22), oklch(0.10 0.02 22))"
          : "linear-gradient(180deg, var(--bg-elev), var(--bg-elev-2))",
        border:
          tile.isSpeaking && !sharing
            ? "1px solid color-mix(in oklch, var(--rv-live) 60%, var(--border))"
            : "1px solid var(--border-soft)",
        boxShadow:
          tile.isSpeaking && !sharing
            ? "0 0 0 2px color-mix(in oklch, var(--rv-live) 35%, transparent), 0 0 24px -8px var(--rv-live)"
            : sharing
              ? "0 0 0 2px color-mix(in oklch, var(--accent) 30%, transparent), 0 0 30px -10px var(--accent)"
              : "var(--shadow-2)",
        overflow: "hidden",
        transition: "box-shadow var(--d-mid) var(--ease-out), border-color var(--d-mid) var(--ease-out)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
      }}
    >
      {sharing ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={tile.isLocal}
          style={{ width: "100%", height: "100%", objectFit: "contain", background: "black" }}
        />
      ) : (
        <span className="rv-avatar" data-tone={toneOf(tile.id)} data-size={big ? "xl" : "lg"}>
          {tile.name.charAt(0).toUpperCase() || "?"}
        </span>
      )}

      {tile.isSpeaking && !sharing && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            borderRadius: "inherit",
            background:
              "radial-gradient(60% 50% at 50% 60%, color-mix(in oklch, var(--rv-live) 18%, transparent), transparent 70%)",
          }}
        />
      )}

      <div
        style={{
          position: "absolute",
          left: 10,
          bottom: 10,
          right: 10,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 8px",
          background: "color-mix(in oklch, var(--rv-ink-0) 65%, transparent)",
          backdropFilter: "blur(8px)",
          borderRadius: 999,
          border: "1px solid var(--border-soft)",
          fontSize: "var(--t-xs)",
          width: "fit-content",
        }}
      >
        {tile.muted ? (
          <I.MicOff size={10} style={{ color: "var(--accent-glow)" }} />
        ) : (
          <MiniVu active={tile.isSpeaking} />
        )}
        <span style={{ fontWeight: 500 }}>{tile.name}</span>
        {tile.isLocal && <span style={{ color: "var(--text-faint)" }}>· you</span>}
        <span className="rv-mono" style={{ color: "var(--text-faint)", fontSize: 9 }}>
          {latencyOf(tile.id)}ms
        </span>
      </div>

      {sharing && (
        <div
          className="rv-corner-tag"
          style={{
            background: "color-mix(in oklch, var(--accent) 25%, transparent)",
            color: "var(--text)",
          }}
        >
          ◉ SHARING
        </div>
      )}
    </div>
  );
}

function GridLayout({
  people,
  callbacks,
}: {
  people: ParticipantView[];
  callbacks: TileCallbacks;
}): ReactElement {
  const cols = people.length <= 2 ? 2 : people.length <= 4 ? 2 : people.length <= 9 ? 3 : 4;
  return (
    <div
      style={{
        display: "grid",
        gap: "var(--s-3)",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
      }}
    >
      {people.map((p) => (
        <Tile key={p.id} tile={p} big={false} callbacks={callbacks} />
      ))}
    </div>
  );
}

function SpeakerLayout({
  people,
  sharer,
  callbacks,
}: {
  people: ParticipantView[];
  sharer: ParticipantView | null;
  callbacks: TileCallbacks;
}): ReactElement {
  const focus = sharer ?? people.find((p) => p.isSpeaking) ?? people[0];
  if (!focus) {
    return <div />;
  }
  const rest = people.filter((p) => p.id !== focus.id);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr",
        gridTemplateRows: "1fr auto",
        gap: "var(--s-3)",
        height: "100%",
        minHeight: 420,
      }}
    >
      <Tile tile={focus} big callbacks={callbacks} />
      <div
        className="rv-scroll"
        style={{
          display: "grid",
          gridAutoFlow: "column",
          gridAutoColumns: "minmax(140px, 180px)",
          gap: "var(--s-3)",
          overflowX: "auto",
          paddingBottom: 4,
        }}
      >
        {rest.map((p) => (
          <div key={p.id} style={{ width: 180 }}>
            <Tile tile={p} big={false} callbacks={callbacks} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ControlButton({
  icon,
  label,
  active,
  danger,
  leave,
  emphasis,
  onClick,
  title,
}: {
  icon: ReactNode;
  label: string;
  active?: boolean;
  danger?: boolean;
  leave?: boolean;
  emphasis?: boolean;
  onClick?: () => void;
  title?: string;
}): ReactElement {
  // `active` is decorative-only here; designer uses it for hover affordance —
  // current visual relies on bg/border combinations below.
  void active;
  const bg = leave
    ? "linear-gradient(180deg, var(--accent-hover), var(--accent))"
    : emphasis
      ? "color-mix(in oklch, var(--accent) 20%, var(--bg-elev-2))"
      : danger
        ? "color-mix(in oklch, var(--accent) 14%, var(--bg-elev-2))"
        : "var(--bg-elev-2)";
  const br = leave
    ? "color-mix(in oklch, var(--accent) 70%, black)"
    : emphasis
      ? "color-mix(in oklch, var(--accent) 50%, var(--border))"
      : danger
        ? "color-mix(in oklch, var(--accent) 30%, var(--border))"
        : "var(--border)";
  const co = leave ? "var(--on-accent)" : danger ? "var(--accent-glow)" : "var(--text)";
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        padding: "10px 18px",
        background: bg,
        border: `1px solid ${br}`,
        borderRadius: "var(--r-lg)",
        color: co,
        cursor: "pointer",
        transition: "all var(--d-base) var(--ease-out)",
        minWidth: 84,
        boxShadow: leave
          ? "var(--shadow-1), 0 8px 24px -8px color-mix(in oklch, var(--accent) 60%, transparent)"
          : "var(--shadow-1)",
      }}
      onMouseEnter={(e) => {
        if (!leave) e.currentTarget.style.background = "var(--bg-elev-3)";
      }}
      onMouseLeave={(e) => {
        if (!leave) e.currentTarget.style.background = bg;
      }}
    >
      {icon}
      <span style={{ fontSize: "var(--t-xs)", fontWeight: 500, letterSpacing: ".01em" }}>{label}</span>
    </button>
  );
}

export function InRoomScreen(props: InRoomScreenProps): ReactElement {
  const token = useAuthStore((s) => s.token);
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const user = useAuthStore((s) => s.user);

  const roomWrapper = useMemo(() => new LiveKitRoom(), []);
  const [conn, setConn] = useState<ConnectionState>({ phase: "connecting" });
  const [maximizedId, setMaximizedId] = useState<string | null>(null);
  const [voiceVolumes, setVoiceVolumes] = useState<Record<string, number>>({});
  const [screenVolumes, setScreenVolumes] = useState<Record<string, number>>({});
  const [menu, setMenu] = useState<VolumeMenu | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [layout, setLayout] = useState<LayoutMode>("auto");

  const snapshot: RoomStateSnapshot = useSyncExternalStore(
    (cb) => roomWrapper.subscribe(() => cb()),
    () => roomWrapper.snapshot(),
    () => roomWrapper.snapshot(),
  );

  const audioMountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

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

  const pttKeybind = usePrefs((s) => s.pttKeybind);
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

  const muted = !(snapshot.local?.isMicrophoneEnabled ?? true);

  const tiles: ParticipantView[] = [];
  if (snapshot.local) {
    tiles.push({
      id: snapshot.local.identity,
      name: snapshot.local.name || snapshot.local.identity,
      isSpeaking: snapshot.local.isSpeaking,
      isLocal: true,
      muted,
      screenTrack: findScreenTrack(snapshot.local),
    });
  }
  for (const remote of snapshot.remotes as RemoteParticipant[]) {
    tiles.push({
      id: remote.identity,
      name: remote.name || remote.identity,
      isSpeaking: remote.isSpeaking,
      isLocal: false,
      muted: isRemoteMuted(remote),
      screenTrack: findScreenTrack(remote),
    });
  }

  const sharing = hasScreenShare(snapshot.local);
  const sharingParticipants = tiles.filter((t) => t.screenTrack !== null);
  const maximizedTile = maximizedId ? tiles.find((t) => t.id === maximizedId) : null;
  const menuParticipant = menu ? tiles.find((t) => t.id === menu.participantId) : null;
  const menuParticipantName = menuParticipant?.name ?? "participant";
  const menuIsLocal = menuParticipant?.isLocal ?? false;

  const useSpeaker = layout === "speaker" || (layout === "auto" && sharingParticipants.length > 0);
  const focusSharer = sharingParticipants[0] ?? null;

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
        <div style={{ flex: 1, minHeight: 0, padding: 24 }}>
          <Tile tile={maximizedTile} big callbacks={tileCallbacks} />
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

  const localDisplayName = user?.displayName ?? snapshot.local?.name ?? snapshot.local?.identity ?? "You";
  const localAvatarChar = (localDisplayName.charAt(0) || "?").toUpperCase();

  const sharingBadgeText =
    sharingParticipants.length === 1
      ? `${sharingParticipants[0]?.name ?? "Someone"} sharing`
      : `${sharingParticipants.length} people sharing`;

  return (
    <div
      style={{ display: "grid", gridTemplateRows: "auto 1fr auto", height: "100%" }}
      onClick={() => setMenu(null)}
    >
      {/* Top bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--s-3) var(--s-5)",
          borderBottom: "1px solid var(--border-soft)",
          background: "color-mix(in oklch, var(--rv-ink-0) 30%, transparent)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)" }}>
          <I.Logo size={20} />
          <span className="rv-label">IN ROOM</span>
          <span className="rv-mono" style={{ color: "var(--text-mid)", fontSize: "var(--t-xs)" }}>
            {props.roomId.slice(0, 8)}…
          </span>
          <span className="rv-badge" data-tone="live">
            <span className="pip" /> LIVE · {fmtTime(elapsed)}
          </span>
          {sharingParticipants.length > 0 && (
            <button
              className="rv-badge"
              data-tone="red"
              onClick={() => {
                if (focusSharer) setMaximizedId(focusSharer.id);
              }}
              style={{
                cursor: "pointer",
                background: "transparent",
                font: "inherit",
              }}
              title="Click to focus"
            >
              <I.Screen size={11} /> {sharingBadgeText}
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
          {conn.phase === "connecting" ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--s-2)",
                color: "var(--text-mid)",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--t-2xs)",
                letterSpacing: ".06em",
                textTransform: "uppercase",
              }}
            >
              <Spinner /> Connecting…
            </span>
          ) : conn.phase === "error" ? (
            <span
              className="rv-mono"
              style={{
                color: "var(--accent-glow)",
                fontSize: "var(--t-2xs)",
              }}
            >
              Error: {conn.message}
            </span>
          ) : (
            <>
              <NetMeter latency={42} />
              <span
                className="rv-mono"
                style={{ fontSize: "var(--t-2xs)", color: "var(--text-faint)" }}
              >
                {tiles.length} participants
              </span>
            </>
          )}
          <CopyLinkButton roomId={props.roomId} serverUrl={serverUrl} />
          <button
            className="rv-btn rv-btn-icon"
            data-variant="ghost"
            onClick={() => setChatOpen((c) => !c)}
            title="Toggle chat"
            data-active={chatOpen}
          >
            <I.Chat size={16} />
          </button>
          <button
            className="rv-btn rv-btn-icon"
            data-variant="ghost"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
          >
            <I.Settings size={16} />
          </button>
        </div>
      </header>

      {/* Body */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(220px, 260px) 1fr",
          minHeight: 0,
          position: "relative",
        }}
      >
        {/* Sidebar */}
        <aside
          className="rv-scroll"
          style={{
            borderRight: "1px solid var(--border-soft)",
            padding: "var(--s-5)",
            overflow: "auto",
            background: "color-mix(in oklch, var(--rv-ink-0) 25%, transparent)",
          }}
        >
          <div className="rv-section-head">
            <span className="rv-label">Participants</span>
            <span
              className="rv-mono"
              style={{ fontSize: "var(--t-2xs)", color: "var(--text-faint)" }}
            >
              {tiles.length}
            </span>
          </div>
          <div className="rv-list">
            {tiles.map((tile) => {
              const tileSharing = tile.screenTrack !== null;
              return (
                <div
                  key={tile.id}
                  className="rv-list-item"
                  data-active={tileSharing}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ participantId: tile.id, x: e.clientX, y: e.clientY });
                  }}
                >
                  <div style={{ position: "relative" }}>
                    <span
                      className="rv-avatar"
                      data-tone={toneOf(tile.id)}
                      style={{ width: 28, height: 28, fontSize: 11 }}
                    >
                      {tile.name.charAt(0).toUpperCase() || "?"}
                    </span>
                    {tile.isSpeaking && (
                      <span className="rv-speaking-ring" style={{ inset: -2 }} />
                    )}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 1,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: "var(--t-sm)",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {tile.name}
                      {tile.isLocal && <span style={{ color: "var(--text-faint)" }}>(you)</span>}
                      {tileSharing && (
                        <I.Screen size={10} style={{ color: "var(--accent-glow)" }} />
                      )}
                    </span>
                    <span
                      className="rv-mono"
                      style={{ fontSize: 10, color: "var(--text-faint)" }}
                    >
                      {tileSharing ? "sharing" : tile.isSpeaking ? "speaking" : "idle"} ·{" "}
                      {latencyOf(tile.id)}ms
                    </span>
                  </div>
                  {tile.muted ? (
                    <I.MicOff size={12} style={{ color: "var(--text-faint)" }} />
                  ) : (
                    <MiniVu active={tile.isSpeaking} />
                  )}
                </div>
              );
            })}
          </div>

          <div className="rv-section-head" style={{ marginTop: "var(--s-6)" }}>
            <span className="rv-label">Room</span>
          </div>
          <KV
            label="ID"
            value={
              <span className="rv-mono" style={{ fontSize: 10 }}>
                {props.roomId.slice(0, 16)}…
              </span>
            }
          />
          <KV label="Codec" value="OPUS · 48 kHz" />
          <KV label="Region" value="auto · self-hosted" />
          <KV label="Recording" value={<span style={{ color: "var(--text-faint)" }}>off</span>} />
        </aside>

        {/* Tiles */}
        <main
          className="rv-scroll"
          style={{
            padding: "var(--s-5)",
            overflow: "auto",
            minHeight: 0,
            containerType: "inline-size",
          }}
        >
          {useSpeaker ? (
            <SpeakerLayout people={tiles} sharer={focusSharer} callbacks={tileCallbacks} />
          ) : (
            <GridLayout people={tiles} callbacks={tileCallbacks} />
          )}
        </main>

        {/* Layout switcher (floating) */}
        <div
          style={{
            position: "absolute",
            top: "var(--s-5)",
            right: "var(--s-5)",
            display: "flex",
            padding: 3,
            background: "color-mix(in oklch, var(--bg-elev) 80%, transparent)",
            border: "1px solid var(--border-soft)",
            borderRadius: "var(--r-md)",
            backdropFilter: "blur(8px)",
            zIndex: 5,
          }}
        >
          {(
            [
              ["auto", "Auto"],
              ["grid", "Grid"],
              ["speaker", "Speaker"],
            ] as const
          ).map(([k, v]) => (
            <button
              key={k}
              onClick={() => setLayout(k)}
              style={{
                appearance: "none",
                border: 0,
                cursor: "pointer",
                padding: "5px 11px",
                borderRadius: 5,
                background:
                  layout === k
                    ? "color-mix(in oklch, var(--accent) 18%, var(--bg-elev-2))"
                    : "transparent",
                color: layout === k ? "var(--text)" : "var(--text-dim)",
                fontSize: "var(--t-xs)",
                fontFamily: "var(--font-mono)",
                letterSpacing: ".06em",
              }}
            >
              {v}
            </button>
          ))}
        </div>

        {chatOpen && (
          <RoomChatPanel
            room={roomWrapper}
            localIdentity={snapshot.local?.identity ?? "you"}
            localName={localDisplayName}
            onClose={() => setChatOpen(false)}
          />
        )}
      </div>

      {/* Control bar */}
      <footer
        style={{
          padding: "var(--s-4) var(--s-5)",
          borderTop: "1px solid var(--border-soft)",
          background: "color-mix(in oklch, var(--rv-ink-0) 50%, transparent)",
          backdropFilter: "blur(8px)",
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)" }}>
          <span className="rv-avatar" data-tone={toneOf(snapshot.local?.identity ?? "you")} data-size="lg">
            {localAvatarChar}
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontWeight: 500 }}>
              {localDisplayName} <span style={{ color: "var(--text-faint)" }}>(you)</span>
            </span>
            <span
              className="rv-mono"
              style={{
                fontSize: 10,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                color: muted ? "var(--accent-glow)" : "var(--text-faint)",
              }}
            >
              {muted ? "muted" : sharing ? "sharing" : "live"}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "var(--s-3)" }}>
          <ControlButton
            icon={muted ? <I.MicOff size={20} /> : <I.Mic size={20} />}
            label={muted ? "Unmute" : "Mute"}
            active={!muted}
            danger={muted}
            onClick={() => void roomWrapper.setMuted(!muted)}
          />
          <ControlButton
            icon={sharing ? <I.ScreenOff size={20} /> : <I.Screen size={20} />}
            label={sharing ? "Stop share" : "Share screen"}
            active={sharing}
            emphasis={sharing}
            onClick={() => void handleToggleScreen()}
          />
          <ControlButton
            icon={<I.Headphones size={20} />}
            label="Deafen"
            onClick={() => {
              /* Coming soon — no-op stub */
            }}
            title="Coming soon"
          />
          <div style={{ width: 1, background: "var(--border-soft)", margin: "0 var(--s-2)" }} />
          <ControlButton
            icon={<I.Leave size={20} />}
            label="Leave"
            leave
            onClick={() => void handleLeave()}
          />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: "var(--s-3)",
            color: "var(--text-faint)",
          }}
        >
          {pttKeybind && (
            <>
              <kbd style={kbdStyle}>{pttKeybind}</kbd>
              <span
                className="rv-mono"
                style={{
                  fontSize: 10,
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                }}
              >
                push to talk
              </span>
            </>
          )}
        </div>
      </footer>

      {/* Right-click volume menu */}
      {menu && (
        <div
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: menu.y,
            left: menu.x,
            width: 240,
            background: "var(--bg-elev-2)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--r-md)",
            padding: "var(--s-3)",
            boxShadow: "var(--shadow-3)",
            zIndex: 100,
          }}
        >
          <div className="rv-label" style={{ fontSize: 10, marginBottom: 8 }}>
            VOLUME · {menuParticipantName}
            {menuIsLocal && " (you)"}
          </div>

          {menuIsLocal ? (
            <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5 }}>
              You can&apos;t adjust your own volume. Right-click someone else&apos;s tile to change
              their voice or screen audio level.
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

          <hr className="rv-rule" />
          <CtxItem onClick={(e) => e.preventDefault()} title="Coming soon">
            Pin tile
          </CtxItem>
          <CtxItem onClick={(e) => e.preventDefault()} title="Coming soon">
            Whisper
          </CtxItem>
          <CtxItem danger onClick={(e) => e.preventDefault()} title="Coming soon">
            Mute for me
          </CtxItem>
        </div>
      )}

      {/* Hidden audio mount */}
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
      <div
        style={{
          fontSize: 11,
          color: "var(--text-dim)",
          marginBottom: 4,
          display: "flex",
          justifyContent: "space-between",
          fontFamily: "var(--font-mono)",
        }}
      >
        <span>{label}</span>
        <span>{Math.round(value * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={200}
        step={5}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        style={{ width: "100%", accentColor: "var(--accent)" }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          color: "var(--text-faint)",
        }}
      >
        <span>0</span>
        <span>200</span>
      </div>
    </div>
  );
}
