import { useEffect, useMemo, useState, useSyncExternalStore, type ReactElement } from "react";
import { ApiClient } from "../lib/api.js";
import { useAuthStore } from "../lib/auth-context.js";
import { LiveKitRoom, type RoomStateSnapshot } from "../lib/livekit-room.js";
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

  async function handleLeave(): Promise<void> {
    await roomWrapper.leave();
    props.onLeave();
  }

  return (
    <div className="app">
      <div className="topbar">
        <strong>RedVoice — In room</strong>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "var(--text-dim)" }}>
            {conn.phase === "connecting" && "Connecting…"}
            {conn.phase === "connected" && `Connected — ${snapshot.remotes.length + 1} participant(s)`}
            {conn.phase === "error" && `Error: ${conn.message}`}
          </span>
          <button className="btn secondary" onClick={() => void handleLeave()}>
            Leave
          </button>
        </div>
      </div>

      <div style={{ padding: 24, flex: 1 }}>
        {conn.phase === "connecting" && <div style={{ color: "var(--text-dim)" }}>Connecting…</div>}
        {conn.phase === "error" && <div className="error">{conn.message}</div>}
        {conn.phase === "connected" && (
          <div style={{ color: "var(--text-dim)" }}>
            Connected. Participant grid arrives in Task 9.
          </div>
        )}
      </div>
    </div>
  );
}
