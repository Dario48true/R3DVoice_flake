import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { listAudioInputs, listAudioOutputs, type DeviceInfo } from "../lib/media.js";
import { usePrefs, prefsActions } from "../lib/prefs-singleton.js";

type Tab = "devices" | "keybinds" | "compatibility" | "about";

export function SettingsModal({ onClose }: { onClose: () => void }): ReactElement {
  const [tab, setTab] = useState<Tab>("devices");

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-elev)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          minWidth: 640,
          minHeight: 420,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg)",
          }}
        >
          <TabButton label="Devices" active={tab === "devices"} onClick={() => setTab("devices")} />
          <TabButton label="Keybinds" active={tab === "keybinds"} onClick={() => setTab("keybinds")} />
          <TabButton label="Compatibility" active={tab === "compatibility"} onClick={() => setTab("compatibility")} />
          <TabButton label="About" active={tab === "about"} onClick={() => setTab("about")} />
          <div style={{ flex: 1 }} />
          <button
            className="btn secondary"
            onClick={onClose}
            style={{ border: "none", borderRadius: 0, background: "transparent" }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: 24, flex: 1, overflow: "auto" }}>
          {tab === "devices" && <DevicesTab />}
          {tab === "keybinds" && <KeybindsTab />}
          {tab === "compatibility" && <Placeholder label="Compatibility options land in Task 10." />}
          {tab === "about" && <About />}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      onClick={onClick}
      style={{
        background: "transparent",
        border: "none",
        borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
        color: active ? "var(--text)" : "var(--text-dim)",
        padding: "12px 16px",
        cursor: "pointer",
        font: "inherit",
      }}
    >
      {label}
    </button>
  );
}

function Placeholder({ label }: { label: string }): ReactElement {
  return <div style={{ color: "var(--text-dim)" }}>{label}</div>;
}

function About(): ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <strong>RedVoice</strong>
      <div style={{ color: "var(--text-dim)", fontSize: 13 }}>
        Open-source, self-hostable, Discord-style screenshare + voice chat.
      </div>
    </div>
  );
}

export function SettingsSection({ children }: { children: ReactNode }): ReactElement {
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>;
}

function DevicesTab(): ReactElement {
  const [mics, setMics] = useState<DeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<DeviceInfo[]>([]);
  const micId = usePrefs((s) => s.micDeviceId);
  const spkId = usePrefs((s) => s.speakerDeviceId);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([listAudioInputs(), listAudioOutputs()]).then(([ins, outs]) => {
      if (cancelled) return;
      setMics(ins);
      setSpeakers(outs);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SettingsSection>
      <label>
        <div className="section-title">Microphone</div>
        <select
          value={micId ?? ""}
          onChange={(e) => prefsActions().setMicDeviceId(e.target.value || null)}
        >
          {mics.length === 0 && <option value="">No mic detected</option>}
          {mics.map((m) => (
            <option key={m.deviceId} value={m.deviceId}>{m.label}</option>
          ))}
        </select>
      </label>
      <label>
        <div className="section-title">Speakers</div>
        <select
          value={spkId ?? ""}
          onChange={(e) => prefsActions().setSpeakerDeviceId(e.target.value || null)}
        >
          {speakers.length === 0 && <option value="">Default output</option>}
          {speakers.map((s) => (
            <option key={s.deviceId} value={s.deviceId}>{s.label}</option>
          ))}
        </select>
      </label>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 8 }}>
        Changes apply live — no need to rejoin.
      </div>
    </SettingsSection>
  );
}

function KeybindsTab(): ReactElement {
  const current = usePrefs((s) => s.pttKeybind);
  const [recording, setRecording] = useState(false);
  const [captured, setCaptured] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    function onKey(e: KeyboardEvent): void {
      e.preventDefault();
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
      const parts: string[] = [];
      if (e.ctrlKey) parts.push("Control");
      if (e.shiftKey) parts.push("Shift");
      if (e.altKey) parts.push("Alt");
      if (e.metaKey) parts.push("Super");
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      parts.push(key);
      setCaptured(parts.join("+"));
      setRecording(false);
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording]);

  async function save(): Promise<void> {
    if (!captured) return;
    await window.redvoice.setPttKeybind(captured);
    prefsActions().setPttKeybind(captured);
    setCaptured(null);
  }

  async function clear(): Promise<void> {
    await window.redvoice.setPttKeybind(null);
    prefsActions().setPttKeybind(null);
  }

  const display = captured ?? current ?? "(none)";

  return (
    <SettingsSection>
      <div>
        <div className="section-title">Push-to-talk</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <code style={{ padding: "4px 8px", background: "var(--bg)", borderRadius: 4, minWidth: 140, display: "inline-block" }}>
            {display}
          </code>
          <button className="btn secondary" onClick={() => setRecording(true)} disabled={recording}>
            {recording ? "Press a key…" : "Rebind"}
          </button>
          {captured && <button className="btn" onClick={() => void save()}>Save</button>}
          {current && !captured && <button className="btn secondary" onClick={() => void clear()}>Clear</button>}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 8 }}>
          Hold this key to briefly unmute. Works even when the app isn't focused.
        </div>
      </div>
    </SettingsSection>
  );
}
