import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from "react";
import { ApiClient } from "../lib/api.js";
import { useAuthStore } from "../lib/auth-context.js";
import {
  LiveKitRoom,
  RoomEvent,
  Track,
  type LocalParticipant,
  type RemoteParticipant,
  type RoomStateSnapshot,
} from "../lib/livekit-room.js";
import { openMicStream } from "../lib/media.js";
import type { PreJoinSelection } from "./PreJoinScreen.js";

export interface InRoomScreenProps {
  roomId: string;
  selection: PreJoinSelection;
  onLeave(): void;
}

interface ConnectionState {
  phase: "connecting" | "connected" | "error";
  message?: string;
}

function ParticipantTile({
  name,
  isSpeaking,
  isLocal,
}: {
  name: string;
  isSpeaking: boolean;
  isLocal: boolean;
}): ReactElement {
  return (
    <div
      style={{
        background: "var(--bg-elev)",
        border: `2px solid ${isSpeaking ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 8,
        padding: 16,
        minHeight: 120,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        transition: "border-color 120ms linear",
      }}
    >
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
        {name.charAt(0).toUpperCase() || "?"}
      </div>
      <div>
        {name}
        {isLocal && <span style={{ color: "var(--text-dim)" }}> (you)</span>}
      </div>
    </div>
  );
}

export function InRoomScreen(props: InRoomScreenProps): ReactElement {
  const token = useAuthStore((s) => s.token);
  const serverUrl = useAuthStore((s) => s.serverUrl);

  const roomWrapper = useMemo(() => new LiveKitRoom(), []);
  const [conn, setConn] = useState<ConnectionState>({ phase: "connecting" });

  const snapshot: RoomStateSnapshot = useSyncExternalStore(
    (cb) => roomWrapper.subscribe(() => cb()),
    () => roomWrapper.snapshot(),
    () => roomWrapper.snapshot(),
  );

  const audioMountRef = useRef<HTMLDivElement | null>(null);

  // Connect on mount, disconnect on unmount.
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
          publishScreen: props.selection.publishScreen,
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

  // Attach remote audio tracks as they come in. LiveKit's Track.attach() creates
  // an <audio> element wired to the track — we insert it into a hidden container
  // that mounts with the screen so autoplay works.
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

  async function handleLeave(): Promise<void> {
    await roomWrapper.leave();
    props.onLeave();
  }

  const participantTiles: Array<{
    id: string;
    name: string;
    isSpeaking: boolean;
    isLocal: boolean;
  }> = [];

  if (snapshot.local) {
    const local: LocalParticipant = snapshot.local;
    participantTiles.push({
      id: local.identity,
      name: local.name || local.identity,
      isSpeaking: local.isSpeaking,
      isLocal: true,
    });
  }
  for (const remote of snapshot.remotes as RemoteParticipant[]) {
    participantTiles.push({
      id: remote.identity,
      name: remote.name || remote.identity,
      isSpeaking: remote.isSpeaking,
      isLocal: false,
    });
  }

  return (
    <div className="app">
      <div className="topbar">
        <strong>RedVoice — In room</strong>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "var(--text-dim)" }}>
            {conn.phase === "connecting" && "Connecting…"}
            {conn.phase === "connected" && `${participantTiles.length} participant(s)`}
            {conn.phase === "error" && `Error: ${conn.message}`}
          </span>
          <button className="btn secondary" onClick={() => void handleLeave()}>
            Leave
          </button>
        </div>
      </div>

      <div style={{ padding: 24, flex: 1, overflow: "auto" }}>
        {conn.phase === "error" && <div className="error">{conn.message}</div>}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 12,
          }}
        >
          {participantTiles.map((p) => (
            <ParticipantTile key={p.id} name={p.name} isSpeaking={p.isSpeaking} isLocal={p.isLocal} />
          ))}
        </div>
      </div>

      {/* Hidden mount point for <audio> elements created by LiveKit track.attach() */}
      <div ref={audioMountRef} style={{ display: "none" }} aria-hidden="true" />
    </div>
  );
}
