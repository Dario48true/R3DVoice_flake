import { useEffect, useRef, useState, type ReactElement } from "react";
import {
  listAudioInputs,
  listAudioOutputs,
  openMicStream,
  subscribeMicLevel,
  type DeviceInfo,
} from "../lib/media.js";

export interface PreJoinSelection {
  micDeviceId: string | null;
  speakerDeviceId: string | null;
  publishScreen: boolean;
}

export interface PreJoinScreenProps {
  roomId: string;
  onJoin(selection: PreJoinSelection): void;
  onCancel(): void;
}

export function PreJoinScreen(props: PreJoinScreenProps): ReactElement {
  const [mics, setMics] = useState<DeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<DeviceInfo[]>([]);
  const [micDeviceId, setMicDeviceId] = useState<string | null>(null);
  const [speakerDeviceId, setSpeakerDeviceId] = useState<string | null>(null);
  const [publishScreen, setPublishScreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [level, setLevel] = useState(0);

  const warmStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await openMicStream(undefined);
        stream.getTracks().forEach((t) => t.stop());
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "mic permission denied");
      }
      const [ins, outs] = await Promise.all([listAudioInputs(), listAudioOutputs()]);
      if (cancelled) return;
      setMics(ins);
      setSpeakers(outs);
      setMicDeviceId(ins[0]?.deviceId ?? null);
      setSpeakerDeviceId(outs[0]?.deviceId ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!micDeviceId) {
      setLevel(0);
      return;
    }
    let unsubscribe: (() => void) | null = null;
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        stream = await openMicStream(micDeviceId);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        warmStreamRef.current = stream;
        unsubscribe = subscribeMicLevel(stream, (lvl) => {
          if (!cancelled) setLevel(lvl);
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "failed to open mic");
      }
    })();
    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
      if (stream) stream.getTracks().forEach((t) => t.stop());
      warmStreamRef.current = null;
    };
  }, [micDeviceId]);

  function handleJoin(): void {
    setBusy(true);
    props.onJoin({ micDeviceId, speakerDeviceId, publishScreen });
  }

  return (
    <div className="centered">
      <div className="form" style={{ maxWidth: 480 }}>
        <h2 style={{ margin: 0 }}>Pre-join check</h2>
        <div style={{ color: "var(--text-dim)" }}>Room: {props.roomId}</div>

        <label>
          <div className="section-title">Microphone</div>
          <select
            value={micDeviceId ?? ""}
            onChange={(e) => setMicDeviceId(e.target.value || null)}
          >
            {mics.length === 0 && <option value="">No mic detected</option>}
            {mics.map((m) => (
              <option key={m.deviceId} value={m.deviceId}>{m.label}</option>
            ))}
          </select>
          <div
            aria-label="mic level"
            style={{
              marginTop: 6,
              height: 6,
              background: "var(--border)",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.round(level * 100)}%`,
                height: "100%",
                background: "var(--accent)",
                transition: "width 60ms linear",
              }}
            />
          </div>
        </label>

        <label>
          <div className="section-title">Speakers</div>
          <select
            value={speakerDeviceId ?? ""}
            onChange={(e) => setSpeakerDeviceId(e.target.value || null)}
          >
            {speakers.length === 0 && <option value="">Default output</option>}
            {speakers.map((s) => (
              <option key={s.deviceId} value={s.deviceId}>{s.label}</option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={publishScreen}
            onChange={(e) => setPublishScreen(e.target.checked)}
          />
          <span>Share a screen (you'll pick the window/monitor on join)</span>
        </label>

        {error && <div className="error">{error}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={handleJoin} disabled={busy || mics.length === 0}>
            {busy ? "Joining…" : "Join now"}
          </button>
          <button className="btn secondary" onClick={props.onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
