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
import { Field } from "../components/Primitives.js";
import { I } from "../components/Icons.js";
import { IS_MAC } from "../lib/platform.js";

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
  const noiseSuppression = usePrefs((s) => s.noiseSuppression);
  const echoCancellation = usePrefs((s) => s.echoCancellation);
  const autoGainControl = usePrefs((s) => s.autoGainControl);

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
        const stream = await openMicStream(undefined, { noiseSuppression, echoCancellation, autoGainControl });
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
        stream = await openMicStream(micDeviceId, { noiseSuppression, echoCancellation, autoGainControl });
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
    <div style={{ display: "grid", placeItems: "center", height: "100%", padding: "var(--s-7)" }}>
      <div
        className="rv-card rv-fade-in"
        data-glow="true"
        style={{ width: "min(100%, 38rem)", padding: "var(--s-8)" }}
      >
        <div className="rv-corner-tag">PRE-JOIN · MIC CHECK</div>

        <div style={{ marginTop: "var(--s-3)", marginBottom: "var(--s-6)" }}>
          <div className="rv-headline" style={{ fontSize: "var(--t-2xl)", marginBottom: "var(--s-2)" }}>
            One last sound check.
          </div>
          <div
            className="rv-mono"
            style={{ fontSize: "var(--t-xs)", color: "var(--text-dim)", letterSpacing: ".06em" }}
          >
            ROOM&nbsp;·&nbsp;<span style={{ color: "var(--text-mid)" }}>{props.roomId}</span>
          </div>
        </div>

        <Field
          label="Microphone"
          right={
            <span
              className="rv-mono"
              style={{ fontSize: "var(--t-2xs)", color: "var(--text-faint)" }}
            >
              INPUT · 48 kHz
            </span>
          }
        >
          <div style={{ position: "relative" }}>
            <select
              className="rv-select"
              style={{ paddingLeft: "2.4rem" }}
              value={micDeviceId ?? ""}
              onChange={(e) => {
                const v = e.target.value || null;
                setMicDeviceId(v);
                prefsActions().setMicDeviceId(v);
              }}
            >
              {mics.length === 0 && <option value="">No mic detected</option>}
              {mics.map((m) => (
                <option key={m.deviceId} value={m.deviceId}>
                  {m.label}
                </option>
              ))}
            </select>
            <I.Mic
              size={14}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-mid)",
              }}
            />
          </div>
          <div
            style={{
              marginTop: "var(--s-3)",
              display: "flex",
              alignItems: "center",
              gap: "var(--s-3)",
            }}
          >
            <div className="rv-vu" style={{ flex: 1, height: 10 }}>
              <div className="rv-vu-fill" style={{ width: `${level * 100}%` }} />
              <div className="rv-vu-ticks" />
            </div>
            <span
              className="rv-mono"
              style={{
                fontSize: "var(--t-2xs)",
                width: "3.6rem",
                textAlign: "right",
                color: level > 0.85 ? "var(--accent-glow)" : "var(--text-dim)",
              }}
            >
              {Math.round(-60 + level * 60)} dB
            </span>
          </div>
          <div
            style={{
              marginTop: "var(--s-2)",
              fontSize: "var(--t-xs)",
              color: "var(--text-dim)",
            }}
          >
            Speak normally — we'll keep noise suppression on by default.
          </div>
        </Field>

        <div style={{ height: "var(--s-5)" }} />

        <Field
          label="Speakers"
          right={
            // real speaker test is a future enhancement
            <button
              type="button"
              className="rv-btn"
              data-variant="ghost"
              onClick={(e) => e.preventDefault()}
              style={{ height: "1.6rem", padding: "0 var(--s-2)", fontSize: "var(--t-xs)" }}
            >
              <I.Wave size={12} /> Test
            </button>
          }
        >
          <div style={{ position: "relative" }}>
            <select
              className="rv-select"
              style={{ paddingLeft: "2.4rem" }}
              value={speakerDeviceId ?? ""}
              onChange={(e) => {
                const v = e.target.value || null;
                setSpeakerDeviceId(v);
                prefsActions().setSpeakerDeviceId(v);
              }}
            >
              {speakers.length === 0 && <option value="">Default output</option>}
              {speakers.map((s) => (
                <option key={s.deviceId} value={s.deviceId}>
                  {s.label}
                </option>
              ))}
            </select>
            <I.Headphones
              size={14}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-mid)",
              }}
            />
          </div>
        </Field>

        <hr className="rv-rule" style={{ margin: "var(--s-6) 0" }} />

        <label className="rv-check">
          <input
            type="checkbox"
            checked={publishScreen}
            onChange={(e) => setPublishScreen(e.target.checked)}
          />
          <span className="rv-check-box" />
          <span style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
            <I.Screen
              size={16}
              style={{ color: publishScreen ? "var(--accent-glow)" : "var(--text-mid)" }}
            />
            <span style={{ fontWeight: 500 }}>Share a screen</span>
            <span style={{ color: "var(--text-faint)", fontSize: "var(--t-xs)" }}>
              — you'll pick the window or monitor on join
            </span>
          </span>
        </label>

        <div
          style={{
            display: "grid",
            gridTemplateRows: publishScreen ? "1fr" : "0fr",
            transition: `grid-template-rows var(--d-slow) var(--ease-out)`,
          }}
        >
          <div style={{ overflow: "hidden" }}>
            <div
              style={{
                marginTop: publishScreen ? "var(--s-4)" : 0,
                padding: "var(--s-4) var(--s-5)",
                background: "color-mix(in oklch, var(--accent) 6%, var(--bg-elev-2))",
                border: "1px solid color-mix(in oklch, var(--accent) 30%, var(--border-soft))",
                borderRadius: "var(--r-md)",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "var(--s-4) var(--s-5)",
                alignItems: "center",
              }}
            >
              <Field label="Resolution">
                <Segmented
                  options={["720p", "1080p", "1440p", "4K"]}
                  value={resolution}
                  onChange={(v) => {
                    setResolution(v);
                    prefsActions().setResolution(v as Resolution);
                  }}
                />
              </Field>
              <Field label="Frame rate">
                <Segmented
                  options={[30, 60]}
                  value={frameRate}
                  onChange={(v) => {
                    setFrameRate(v as 30 | 60);
                    prefsActions().setFrameRate(v as 30 | 60);
                  }}
                  suffix=" fps"
                />
              </Field>
              <label className="rv-check" style={{ gridColumn: "1 / -1" }}>
                <input
                  type="checkbox"
                  checked={shareAudio}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setShareAudio(v);
                    prefsActions().setShareAudio(v);
                  }}
                />
                <span className="rv-check-box" />
                <span>
                  Include system audio
                  {IS_MAC && (
                    <span
                      style={{
                        color: "var(--text-faint)",
                        fontSize: "var(--t-xs)",
                        marginLeft: "var(--s-2)",
                      }}
                    >
                      (macOS asks for permission once)
                    </span>
                  )}
                </span>
              </label>
            </div>
          </div>
        </div>

        {error && (
          <div
            style={{
              marginTop: "var(--s-4)",
              color: "var(--accent-glow)",
              fontSize: "var(--t-sm)",
              padding: "var(--s-2) var(--s-3)",
              border: "1px solid color-mix(in oklch, var(--accent) 40%, transparent)",
              borderRadius: "var(--r-sm)",
              background: "color-mix(in oklch, var(--accent) 8%, var(--bg-elev-2))",
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            marginTop: "var(--s-7)",
            display: "flex",
            gap: "var(--s-3)",
            justifyContent: "flex-end",
            alignItems: "center",
          }}
        >
          <span
            className="rv-mono"
            style={{
              fontSize: "var(--t-2xs)",
              color: "var(--text-faint)",
              marginRight: "auto",
              letterSpacing: ".06em",
            }}
          >
            ↵ ENTER TO JOIN
          </span>
          <button type="button" className="rv-btn" onClick={props.onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="rv-btn"
            data-variant="primary"
            onClick={handleJoin}
            style={{ minWidth: "9rem" }}
            disabled={busy || mics.length === 0}
          >
            <I.Mic size={14} /> {busy ? "Joining…" : "Join now"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Segmented<T extends string | number>(props: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  suffix?: string;
}): ReactElement {
  const { options, value, onChange, suffix = "" } = props;
  return (
    <div
      style={{
        display: "inline-flex",
        padding: 3,
        background: "var(--bg-elev-3)",
        border: "1px solid var(--border-soft)",
        borderRadius: "var(--r-md)",
        gap: 2,
      }}
    >
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          onClick={() => onChange(o)}
          style={{
            appearance: "none",
            border: 0,
            padding: "6px 14px",
            borderRadius: "calc(var(--r-md) - 3px)",
            background:
              value === o
                ? "linear-gradient(180deg, var(--accent-hover), var(--accent))"
                : "transparent",
            color: value === o ? "var(--on-accent)" : "var(--text-mid)",
            fontSize: "var(--t-sm)",
            fontWeight: 500,
            fontFamily: "var(--font-mono)",
            cursor: "pointer",
            boxShadow: value === o ? "var(--shadow-1)" : "none",
            transition: "all var(--d-base) var(--ease-out)",
          }}
        >
          {o}
          {suffix}
        </button>
      ))}
    </div>
  );
}
