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
          {tab === "keybinds" && <Placeholder label="Keybinds UI lands in Task 7." />}
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
