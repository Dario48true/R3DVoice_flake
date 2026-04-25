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
import { usePrefs, prefsActions } from "../lib/prefs-singleton.js";
import type { LinuxAudioSourceSummary, WindowsAudioSessionInfo } from "../../../shared/bridge-types.js";
import { CopyLinkButton } from "../components/CopyLinkButton.js";
import { I } from "../components/Icons.js";
import { Spinner } from "../components/Primitives.js";
import { RoomChatPanel } from "../components/RoomChatPanel.js";
import { useKeybind } from "../lib/keybinds.js";

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
  cameraTrack: Track | null;
  /** LiveKit ConnectionQuality string: "unknown"|"poor"|"good"|"excellent"|"lost". */
  quality: string;
}

interface TileCallbacks {
  onClick(id: string): void;
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

// Mirror of server-side dmThreadId — canonical-pair so both participants
// resolve the same thread. Server validates participation; this is just for
// constructing the URL/threadId on the client side.
function canonicalDmThreadId(a: string, b: string): string {
  const [first, second] = a < b ? [a, b] : [b, a];
  return `${first}:${second}`;
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

function findCameraTrack(p: LocalParticipant | RemoteParticipant): Track | null {
  for (const pub of p.trackPublications.values()) {
    if (pub.source === Track.Source.Camera && pub.track) {
      return pub.track;
    }
  }
  return null;
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
  // Off state: 4 flat bars (no animation, no varying height) — communicates
  // "mic on, not speaking" without distracting motion.
  // On state: varying heights with the live-pulse animation.
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 14 }}>
      {[0.4, 0.7, 1, 0.55].map((h, i) => (
        <span
          key={i}
          style={{
            width: 2,
            height: active ? `${h * 100}%` : "20%",
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

// LiveKit ConnectionQuality enum: "unknown" | "poor" | "good" | "excellent" | "lost".
// Map to bar-count + tone for the NetMeter visualization.
function qualityToMeter(quality: string | undefined): { bars: number; tone: string } {
  switch (quality) {
    case "excellent":
      return { bars: 4, tone: "var(--rv-live)" };
    case "good":
      return { bars: 3, tone: "var(--rv-live)" };
    case "poor":
      return { bars: 2, tone: "var(--rv-amber)" };
    case "lost":
      return { bars: 1, tone: "var(--accent)" };
    default:
      return { bars: 0, tone: "var(--rv-ink-400)" };
  }
}

function NetMeter({ quality, height = 14 }: { quality: string | undefined; height?: number }): ReactElement {
  const { bars, tone } = qualityToMeter(quality);
  const sizes = height === 14 ? [6, 9, 12, 15] : [4, 6, 8, 10];
  return (
    <span style={{ display: "flex", alignItems: "flex-end", gap: 2, height, padding: "0 4px" }}>
      {sizes.map((h, i) => (
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
  const camRef = useRef<HTMLVideoElement | null>(null);
  const sharing = tile.screenTrack !== null;
  // Primary track to attach: screen if sharing, else camera. Camera-as-PiP-overlay
  // when both is rendered separately via camRef below.
  const primaryTrack = tile.screenTrack ?? tile.cameraTrack;
  const showCameraOverlay = sharing && tile.cameraTrack !== null;

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !primaryTrack) return;
    primaryTrack.attach(el);
    const applyDimensions = (): void => {
      const settings = primaryTrack.mediaStreamTrack.getSettings();
      if (settings.width && settings.height) {
        el.width = settings.width;
        el.height = settings.height;
      }
    };
    applyDimensions();
    const retry = setTimeout(applyDimensions, 500);
    return () => {
      clearTimeout(retry);
      primaryTrack.detach(el);
    };
  }, [primaryTrack]);

  useEffect(() => {
    const el = camRef.current;
    const track = tile.cameraTrack;
    if (!el || !track || !showCameraOverlay) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [tile.cameraTrack, showCameraOverlay]);

  function onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    callbacks.onContextMenu(tile.id, e.clientX, e.clientY);
  }

  function onDoubleClick(): void {
    callbacks.onDoubleClick(tile.id, videoRef.current);
  }

  function onClick(): void {
    callbacks.onClick(tile.id);
  }

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      title="Click to focus · double-click to fullscreen · right-click for volume"
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
      {primaryTrack ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={tile.isLocal}
          style={{
            width: "100%",
            height: "100%",
            objectFit: sharing ? "contain" : "cover",
            background: "black",
          }}
        />
      ) : (
        <span className="rv-avatar" data-tone={toneOf(tile.id)} data-size={big ? "xl" : "lg"}>
          {tile.name.charAt(0).toUpperCase() || "?"}
        </span>
      )}

      {showCameraOverlay && (
        <video
          ref={camRef}
          autoPlay
          playsInline
          muted={tile.isLocal}
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            width: "22%",
            aspectRatio: "16/9",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--border)",
            objectFit: "cover",
            background: "black",
            boxShadow: "var(--shadow-2)",
          }}
        />
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
        <NetMeter quality={tile.quality} height={10} />
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

      {sharing && (
        <button
          type="button"
          aria-label="Picture-in-picture"
          title="Picture-in-picture"
          onClick={async (e) => {
            e.stopPropagation();
            const v = videoRef.current;
            if (!v) return;
            try {
              if (document.pictureInPictureElement === v) {
                await document.exitPictureInPicture();
              } else {
                await v.requestPictureInPicture();
              }
            } catch {
              // PiP can fail if the video has no frame yet, or the OS denied.
              // Silent — the user can try again.
            }
          }}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            background: "color-mix(in oklch, var(--rv-ink-0) 70%, transparent)",
            backdropFilter: "blur(8px)",
            border: "1px solid var(--border-soft)",
            borderRadius: 6,
            color: "var(--text)",
            cursor: "pointer",
          }}
        >
          <I.Pip size={14} />
        </button>
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
  focusedId,
  callbacks,
}: {
  people: ParticipantView[];
  sharer: ParticipantView | null;
  focusedId: string | null;
  callbacks: TileCallbacks;
}): ReactElement {
  // User's explicit click-to-focus wins over auto-pick (sharer → speaker → first).
  const userFocused = focusedId ? people.find((p) => p.id === focusedId) ?? null : null;
  const focus = userFocused ?? sharer ?? people.find((p) => p.isSpeaking) ?? people[0];
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

interface AudioSourceOption {
  pid: string;
  label: string;
}

function ShareAudioControl({
  enabled,
  roomWrapper,
}: {
  enabled: boolean;
  roomWrapper: LiveKitRoom;
}): ReactElement {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sources, setSources] = useState<AudioSourceOption[]>([]);
  const [selectedPid, setSelectedPid] = useState<string | null>(null);
  const platform = window.redvoice?.platform();
  const showPicker = platform === "linux" || platform === "win32";

  useEffect(() => {
    if (!pickerOpen || !showPicker) return;
    let cancelled = false;
    const load = async (): Promise<void> => {
      let opts: AudioSourceOption[] = [];
      if (platform === "linux") {
        const list: LinuxAudioSourceSummary[] = await window.redvoice.listLinuxAudioSources();
        opts = list.map((s) => ({ pid: s.processId, label: s.appName }));
      } else if (platform === "win32") {
        const list: WindowsAudioSessionInfo[] = await window.redvoice.listWindowsAudioSessions();
        opts = list.map((s) => ({
          pid: String(s.pid),
          label: s.displayName?.trim() || s.imageName.replace(/\.exe$/i, ""),
        }));
      }
      if (!cancelled) setSources(opts);
    };
    void load();
    return () => { cancelled = true; };
  }, [pickerOpen, showPicker, platform]);

  // Close picker on outside click via the existing global handler.
  useEffect(() => {
    if (!pickerOpen) return;
    function onMouseDown(e: globalThis.MouseEvent): void {
      if (e.button !== 0) return;
      setPickerOpen(false);
    }
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [pickerOpen]);

  async function pickSource(pid: string | null): Promise<void> {
    setSelectedPid(pid);
    setPickerOpen(false);
    if (!enabled) return;
    // Re-link with new scope.
    await roomWrapper.disableScreenShareAudio();
    await roomWrapper.enableScreenShareAudio(pid ?? undefined);
  }

  const selectedLabel = selectedPid
    ? sources.find((s) => s.pid === selectedPid)?.label ?? `PID ${selectedPid}`
    : "All apps";

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 0 }}>
      <ControlButton
        icon={<I.Speaker size={20} />}
        label={enabled ? "Stop audio" : "Share audio"}
        active={enabled}
        emphasis={enabled}
        title={
          enabled
            ? `Source: ${selectedLabel} — click to stop`
            : "Add system audio to your screen share"
        }
        onClick={() => {
          void (enabled
            ? roomWrapper.disableScreenShareAudio()
            : roomWrapper.enableScreenShareAudio(selectedPid ?? undefined));
        }}
      />
      {showPicker && (
        <button
          type="button"
          aria-label="Pick audio source"
          title="Pick which app's audio to share"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setPickerOpen((v) => !v)}
          style={{
            appearance: "none",
            border: 0,
            background: "transparent",
            color: enabled ? "var(--text)" : "var(--text-faint)",
            cursor: "pointer",
            padding: "0 4px",
            marginLeft: -6,
            height: "100%",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          <I.ChevronDown size={12} />
        </button>
      )}
      {pickerOpen && showPicker && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 0,
            zIndex: 30,
            minWidth: 220,
            maxHeight: 280,
            overflowY: "auto",
            padding: 4,
            background: "var(--bg-elev-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-md)",
            boxShadow: "var(--shadow-2)",
          }}
        >
          <SourceMenuItem
            active={selectedPid === null}
            onClick={() => void pickSource(null)}
          >
            All apps <span style={{ color: "var(--text-faint)" }}>(except RedVoice)</span>
          </SourceMenuItem>
          {sources.length === 0 ? (
            <div style={{ padding: 10, color: "var(--text-faint)", fontSize: "var(--t-xs)" }}>
              No apps producing audio right now.
            </div>
          ) : (
            sources.map((s) => (
              <SourceMenuItem
                key={`${s.label}-${s.pid}`}
                active={selectedPid === s.pid}
                onClick={() => void pickSource(s.pid)}
              >
                {s.label}
              </SourceMenuItem>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SourceMenuItem({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        appearance: "none",
        border: 0,
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
        padding: "8px 10px",
        borderRadius: "var(--r-sm)",
        background: active ? "color-mix(in oklch, var(--accent) 20%, transparent)" : "transparent",
        color: active ? "var(--text)" : "var(--text-mid)",
        fontSize: "var(--t-sm)",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--bg-elev-3)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      {children}
    </button>
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
  const [deafened, setDeafened] = useState(false);
  const [dmTarget, setDmTarget] = useState<{ id: string; name: string } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [netStats, setNetStats] = useState<{
    rttMs: number | null;
    jitterMs: number | null;
    packetsLost: number | null;
  } | null>(null);
  const [layout, setLayout] = useState<LayoutMode>("auto");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [roomInfoOpen, setRoomInfoOpen] = useState(false);

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
    const tick = async (): Promise<void> => {
      try {
        const stats = await roomWrapper.getNetworkStats();
        if (!cancelled && stats) {
          setNetStats({
            rttMs: stats.rttMs,
            jitterMs: stats.jitterMs,
            packetsLost: stats.packetsLost,
          });
        }
      } catch { /* */ }
    };
    void tick();
    const interval = setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [roomWrapper, conn.phase]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const api = new ApiClient(serverUrl);
        api.setToken(token);
        const { token: lkToken, url } = await api.mintLiveKitToken(props.roomId);
        if (cancelled) return;
        const micStream = props.selection.micDeviceId
          ? await openMicStream(props.selection.micDeviceId, {
              noiseSuppression: micProcessing.noiseSuppression,
              echoCancellation: micProcessing.echoCancellation,
              autoGainControl: micProcessing.autoGainControl,
              gain: micProcessing.gain,
            })
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
      el.muted = deafened;
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
  }, [roomWrapper, deafened]);

  // Deafen toggle: mute every <audio> currently mounted. New tracks pick up
  // the state via the attach handler above.
  useEffect(() => {
    const mount = audioMountRef.current;
    if (!mount) return;
    mount.querySelectorAll("audio").forEach((el) => {
      (el as HTMLAudioElement).muted = deafened;
    });
  }, [deafened]);

  const pttKeybind = usePrefs((s) => s.pttKeybind);
  const muteKeybind = usePrefs((s) => s.muteKeybind);
  const deafenKeybind = usePrefs((s) => s.deafenKeybind);
  const shareScreenKeybind = usePrefs((s) => s.shareScreenKeybind);
  const openSettingsKeybind = usePrefs((s) => s.openSettingsKeybind);
  const leaveRoomKeybind = usePrefs((s) => s.leaveRoomKeybind);
  const prefMic = usePrefs((s) => s.micDeviceId);
  // Select primitives individually — a selector that returns a fresh object
  // literal triggers React #185 because useSyncExternalStore's Object.is
  // snapshot check sees a new reference every render and loops forever.
  const noiseSuppression = usePrefs((s) => s.noiseSuppression);
  const echoCancellation = usePrefs((s) => s.echoCancellation);
  const autoGainControl = usePrefs((s) => s.autoGainControl);
  const micGain = usePrefs((s) => s.micGain);
  const micProcessing = useMemo(
    () => ({ noiseSuppression, echoCancellation, autoGainControl, gain: micGain }),
    [noiseSuppression, echoCancellation, autoGainControl, micGain],
  );
  useEffect(() => {
    if (conn.phase === "connected" && prefMic) {
      void roomWrapper.room.switchActiveDevice("audioinput", prefMic);
    }
  }, [prefMic, conn.phase, roomWrapper]);

  const prefSpeaker = usePrefs((s) => s.speakerDeviceId);
  const favoriteRoomIds = usePrefs((s) => s.favoriteRoomIds);
  const isFavorite = favoriteRoomIds.includes(props.roomId);
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
        setFocusedId(null);
        setRoomInfoOpen(false);
      }
    }
    function onMouseDown(e: globalThis.MouseEvent): void {
      if (e.button !== 0) return;
      setMenu(null);
      setRoomInfoOpen(false);
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

  // Wire prefs-driven keybinds for the in-room actions. PTT remains separate
  // (uses globalShortcut so it works when unfocused).
  useKeybind(muteKeybind, () => {
    void roomWrapper.setMuted(!(snapshot.local?.isMicrophoneEnabled ?? true));
  });
  useKeybind(deafenKeybind, () => setDeafened((d) => !d));
  useKeybind(shareScreenKeybind, () => void handleToggleScreen());
  useKeybind(openSettingsKeybind, () => setSettingsOpen(true));
  useKeybind(leaveRoomKeybind, () => void handleLeave());

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
    onClick: (id) => {
      // Single-click focuses a tile in speaker layout. Click the same tile
      // again to clear focus and let the auto-pick (sharer/speaker) take over.
      setFocusedId((current) => (current === id ? null : id));
    },
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
      cameraTrack: findCameraTrack(snapshot.local),
      quality: snapshot.local.connectionQuality ?? "unknown",
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
      cameraTrack: findCameraTrack(remote),
      quality: remote.connectionQuality ?? "unknown",
    });
  }

  const sharing = hasScreenShare(snapshot.local);
  const cameraOn = snapshot.local?.isCameraEnabled ?? false;
  const sharingParticipants = tiles.filter((t) => t.screenTrack !== null);
  const maximizedTile = maximizedId ? tiles.find((t) => t.id === maximizedId) : null;
  const menuParticipant = menu ? tiles.find((t) => t.id === menu.participantId) : null;
  const menuParticipantName = menuParticipant?.name ?? "participant";
  const menuIsLocal = menuParticipant?.isLocal ?? false;

  // Speaker layout activates when: user picked it, user click-focused a tile,
  // or auto + someone is sharing. focusedId is dropped if its participant left.
  const focusedTileExists = focusedId !== null && tiles.some((t) => t.id === focusedId);
  const effectiveFocusedId = focusedTileExists ? focusedId : null;
  const useSpeaker =
    layout === "speaker" ||
    effectiveFocusedId !== null ||
    (layout === "auto" && sharingParticipants.length > 0);
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
          <span className="rv-badge" data-tone="live">
            <span className="pip" /> LIVE · {fmtTime(elapsed)}
          </span>
          <button
            className="rv-btn rv-btn-icon"
            data-variant="ghost"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => prefsActions().toggleFavoriteRoom(props.roomId)}
            title={isFavorite ? "Unfavorite this room" : "Favorite this room"}
            data-active={isFavorite}
            style={{ padding: "0 var(--s-2)" }}
          >
            {isFavorite ? (
              <I.StarFilled size={14} style={{ color: "var(--rv-amber)" }} />
            ) : (
              <I.Star size={14} style={{ color: "var(--text-mid)" }} />
            )}
          </button>
          <button
            className="rv-btn rv-btn-icon"
            data-variant="ghost"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setRoomInfoOpen((v) => !v)}
            title="Room details"
            data-active={roomInfoOpen}
            style={{ padding: "0 var(--s-2)" }}
          >
            <I.Info size={14} style={{ color: "var(--text-mid)" }} />
          </button>
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
          ) : null}
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
                      style={{
                        fontSize: 10,
                        color: "var(--text-faint)",
                      }}
                    >
                      {tileSharing ? "sharing" : tile.isSpeaking ? "speaking" : "idle"}
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
            <SpeakerLayout
              people={tiles}
              sharer={focusSharer}
              focusedId={effectiveFocusedId}
              callbacks={tileCallbacks}
            />
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
          <button
            onClick={() => {
              const order: LayoutMode[] = ["auto", "grid", "speaker"];
              const next = order[(order.indexOf(layout) + 1) % order.length]!;
              setLayout(next);
            }}
            title={`Layout: ${layout} — click to cycle`}
            style={{
              appearance: "none",
              border: 0,
              cursor: "pointer",
              padding: "5px 11px",
              borderRadius: 5,
              background: "transparent",
              color: "var(--text-dim)",
              fontSize: "var(--t-xs)",
              fontFamily: "var(--font-mono)",
              letterSpacing: ".06em",
              textTransform: "uppercase",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <I.Grid size={12} /> {layout}
          </button>
        </div>

        {chatOpen && (
          <RoomChatPanel
            threadType="room"
            threadId={props.roomId}
            localIdentity={snapshot.local?.identity ?? "you"}
            localName={localDisplayName}
            onClose={() => setChatOpen(false)}
          />
        )}

        {dmTarget && snapshot.local && (
          <RoomChatPanel
            threadType="dm"
            threadId={canonicalDmThreadId(snapshot.local.identity, dmTarget.id)}
            localIdentity={snapshot.local.identity}
            localName={localDisplayName}
            onClose={() => setDmTarget(null)}
          />
        )}
      </div>

      {/* Room info popover */}
      {roomInfoOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            top: 56,
            left: "var(--s-5)",
            zIndex: 30,
            width: 300,
            padding: "var(--s-4) var(--s-5)",
            background: "var(--bg-elev-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-md)",
            boxShadow: "var(--shadow-2)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div className="rv-section-head" style={{ marginBottom: "var(--s-3)" }}>
            <span className="rv-label">Room</span>
            <button
              type="button"
              onClick={() => setRoomInfoOpen(false)}
              aria-label="Close"
              style={{
                marginLeft: "auto",
                appearance: "none",
                border: 0,
                background: "transparent",
                color: "var(--text-faint)",
                cursor: "pointer",
                padding: 2,
              }}
            >
              <I.X size={12} />
            </button>
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
        </div>
      )}

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
        <div style={{ display: "flex", alignItems: "center" }}>
          {muted && (
            <span
              className="rv-mono"
              style={{
                fontSize: 10,
                letterSpacing: ".12em",
                textTransform: "uppercase",
                color: "var(--accent-glow)",
                padding: "3px 8px",
                border: "1px solid color-mix(in oklch, var(--accent) 35%, transparent)",
                borderRadius: 999,
                background: "color-mix(in oklch, var(--accent) 8%, transparent)",
              }}
            >
              ● muted
            </span>
          )}
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
          {sharing && (
            <ShareAudioControl
              enabled={snapshot.screenShareAudioEnabled}
              roomWrapper={roomWrapper}
            />
          )}
          <ControlButton
            icon={cameraOn ? <I.CameraOff size={20} /> : <I.Camera size={20} />}
            label={cameraOn ? "Stop camera" : "Camera"}
            active={cameraOn}
            emphasis={cameraOn}
            onClick={() => void roomWrapper.setCamera(!cameraOn)}
          />
          <ControlButton
            icon={<I.Headphones size={20} />}
            label={deafened ? "Undeafen" : "Deafen"}
            active={!deafened}
            danger={deafened}
            onClick={() => setDeafened((d) => !d)}
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
          {netStats?.rttMs !== null && netStats?.rttMs !== undefined && (
            <span
              className="rv-mono"
              title={`RTT ${Math.round(netStats.rttMs)}ms · jitter ${netStats.jitterMs?.toFixed(1) ?? "—"}ms · lost ${netStats.packetsLost ?? "—"}`}
              style={{
                fontSize: 10,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                color:
                  netStats.rttMs < 150
                    ? "var(--text-faint)"
                    : netStats.rttMs < 400
                      ? "var(--rv-amber)"
                      : "var(--accent-glow)",
              }}
            >
              ↔ {Math.round(netStats.rttMs)} ms
            </span>
          )}
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
          {!menuIsLocal && menuParticipant && (
            <CtxItem
              onClick={() => {
                setDmTarget({ id: menuParticipant.id, name: menuParticipant.name });
                setMenu(null);
              }}
            >
              Send a DM
            </CtxItem>
          )}
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
