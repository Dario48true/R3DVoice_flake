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

interface ParticipantView {
  id: string;
  name: string;
  isSpeaking: boolean;
  isLocal: boolean;
  screenTrack: Track | null;
}

function ParticipantTile({ p }: { p: ParticipantView }): ReactElement {
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

  return (
    <div
      style={{
        background: "var(--bg-elev)",
        border: `2px solid ${p.isSpeaking ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 8,
        padding: p.screenTrack ? 0 : 16,
        minHeight: 180,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        transition: "border-color 120ms linear",
        overflow: "hidden",
        position: "relative",
      }}
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

  return (
    <div className="app">
      <div className="topbar">
        <strong>RedVoice — In room</strong>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "var(--text-dim)" }}>
            {conn.phase === "connecting" && "Connecting…"}
            {conn.phase === "connected" && `${tiles.length} participant(s)`}
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
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 12,
          }}
        >
          {tiles.map((p) => (
            <ParticipantTile key={p.id} p={p} />
          ))}
        </div>
      </div>

      <div ref={audioMountRef} style={{ display: "none" }} aria-hidden="true" />
    </div>
  );
}
