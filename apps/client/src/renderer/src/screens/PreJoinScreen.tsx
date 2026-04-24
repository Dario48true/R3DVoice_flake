import { useEffect, useRef, useState, type ReactElement } from "react";
import {
  listAudioInputs,
  listAudioOutputs,
  openMicStream,
  subscribeMicLevel,
  type DeviceInfo,
} from "../lib/media.js";
import { usePrefs, prefsActions } from "../lib/prefs-singleton.js";
import type { Resolution } from "../lib/prefs-store.js";

export interface ScreenQuality {
  width: number;
  height: number;
  frameRate: number;
  audio: boolean;
}

export interface PreJoinSelection {
  micDeviceId: string | null;
  speakerDeviceId: string | null;
  publishScreen: boolean;
  screenQuality: ScreenQuality;
}

const RESOLUTIONS: Record<string, { width: number; height: number }> = {
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
  "1440p": { width: 2560, height: 1440 },
  "4K": { width: 3840, height: 2160 },
};

export interface PreJoinScreenProps {
  roomId: string;
  onJoin(selection: PreJoinSelection): void;
  onCancel(): void;
}

export function PreJoinScreen(props: PreJoinScreenProps): ReactElement {
  const persistedMic = usePrefs((s) => s.micDeviceId);
  const persistedSpeaker = usePrefs((s) => s.speakerDeviceId);
  const persistedResolution = usePrefs((s) => s.resolution);
  const persistedFrameRate = usePrefs((s) => s.frameRate);
  const persistedShareAudio = usePrefs((s) => s.shareAudio);

  const [mics, setMics] = useState<DeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<DeviceInfo[]>([]);
  const [micDeviceId, setMicDeviceId] = useState<string | null>(persistedMic);
  const [speakerDeviceId, setSpeakerDeviceId] = useState<string | null>(persistedSpeaker);
  const [publishScreen, setPublishScreen] = useState(false);
  const [resolution, setResolution] = useState<keyof typeof RESOLUTIONS>(persistedResolution);
  const [frameRate, setFrameRate] = useState<30 | 60>(persistedFrameRate);
  const [shareAudio, setShareAudio] = useState(persistedShareAudio);
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
      const persistedMicValid = persistedMic && ins.some((d) => d.deviceId === persistedMic);
      if (!persistedMicValid) {
        setMicDeviceId(ins[0]?.deviceId ?? null);
      }
      const persistedSpeakerValid = persistedSpeaker && outs.some((d) => d.deviceId === persistedSpeaker);
      if (!persistedSpeakerValid) {
        setSpeakerDeviceId(outs[0]?.deviceId ?? null);
      }
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
    const res = RESOLUTIONS[resolution]!;
    props.onJoin({
      micDeviceId,
      speakerDeviceId,
      publishScreen,
      screenQuality: {
        width: res.width,
        height: res.height,
        frameRate,
        audio: shareAudio,
      },
    });
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
            onChange={(e) => { const v = e.target.value || null; setMicDeviceId(v); prefsActions().setMicDeviceId(v); }}
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
            onChange={(e) => { const v = e.target.value || null; setSpeakerDeviceId(v); prefsActions().setSpeakerDeviceId(v); }}
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

        {publishScreen && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              paddingLeft: 24,
            }}
          >
            <label>
              <div className="section-title">Resolution</div>
              <select
                value={resolution}
                onChange={(e) => { const v = e.target.value as keyof typeof RESOLUTIONS; setResolution(v); prefsActions().setResolution(v as Resolution); }}
              >
                {Object.keys(RESOLUTIONS).map((key) => (
                  <option key={key} value={key}>{key}</option>
                ))}
              </select>
            </label>
            <label>
              <div className="section-title">Frame rate</div>
              <select
                value={frameRate}
                onChange={(e) => { const v = Number(e.target.value) as 30 | 60; setFrameRate(v); prefsActions().setFrameRate(v); }}
              >
                <option value={30}>30 fps</option>
                <option value={60}>60 fps</option>
              </select>
            </label>
            <label style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={shareAudio}
                onChange={(e) => { const v = e.target.checked; setShareAudio(v); prefsActions().setShareAudio(v); }}
              />
              <span>Include system audio</span>
            </label>
          </div>
        )}

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
