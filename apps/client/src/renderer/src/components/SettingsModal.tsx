import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { listAudioInputs, listAudioOutputs, type DeviceInfo } from "../lib/media.js";
import { usePrefs, prefsActions } from "../lib/prefs-singleton.js";
import { MOD_KEY, SHIFT_KEY } from "../lib/platform.js";
import type { MediaPermissionStatus } from "../../../shared/bridge-types.js";
import { I } from "./Icons.js";
import { Modal } from "./Modal.js";
import { Field } from "./Primitives.js";

type Tab = "devices" | "keybinds" | "compat" | "about";

// Local copy of the designer's kbd inline style. Will be lifted to a shared
// helper once a third call site appears.
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

export function SettingsModal({ onClose }: { onClose: () => void }): ReactElement {
  const [tab, setTab] = useState<Tab>("devices");

  return (
    <Modal open={true} onClose={onClose} title="Settings">
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", height: 540 }}>
        {/* Side nav */}
        <nav
          style={{
            borderRight: "1px solid var(--border-soft)",
            padding: "var(--s-4) var(--s-3)",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <NavButton
            active={tab === "devices"}
            onClick={() => setTab("devices")}
            icon={<I.Mic size={14} />}
            label="Devices"
          />
          <NavButton
            active={tab === "keybinds"}
            onClick={() => setTab("keybinds")}
            icon={<I.Settings size={14} />}
            label="Keybinds"
          />
          <NavButton
            active={tab === "compat"}
            onClick={() => setTab("compat")}
            icon={<I.Grid size={14} />}
            label="Compatibility"
          />
          <NavButton
            active={tab === "about"}
            onClick={() => setTab("about")}
            icon={<I.Star size={14} />}
            label="About"
          />
        </nav>

        {/* Body */}
        <div className="rv-scroll" style={{ padding: "var(--s-6) var(--s-7)", overflowY: "auto", minHeight: 0 }}>
          {tab === "devices" && <DevicesTab />}
          {tab === "keybinds" && <KeybindsTab />}
          {tab === "compat" && <CompatTab />}
          {tab === "about" && <AboutTab />}
        </div>
      </div>
    </Modal>
  );
}

function NavButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}): ReactElement {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--s-3)",
        padding: "8px 10px",
        border: 0,
        cursor: "pointer",
        textAlign: "left",
        borderRadius: "var(--r-sm)",
        background: active
          ? "color-mix(in oklch, var(--accent) 14%, var(--bg-elev-2))"
          : "transparent",
        color: active ? "var(--text)" : "var(--text-mid)",
        fontSize: "var(--t-sm)",
        fontWeight: 500,
        borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
        paddingLeft: 10,
      }}
    >
      {icon} {label}
    </button>
  );
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--s-5)",
        maxWidth: 460,
      }}
    >
      <div className="rv-section-head">
        <span className="rv-label">Audio In/Out</span>
      </div>
      <Field label="Microphone">
        <select
          className="rv-select"
          value={micId ?? ""}
          onChange={(e) => prefsActions().setMicDeviceId(e.target.value || null)}
        >
          {mics.length === 0 && <option value="">No mic detected</option>}
          {mics.map((m) => (
            <option key={m.deviceId} value={m.deviceId}>
              {m.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Speakers">
        <select
          className="rv-select"
          value={spkId ?? ""}
          onChange={(e) => prefsActions().setSpeakerDeviceId(e.target.value || null)}
        >
          {speakers.length === 0 && <option value="">Default output</option>}
          {speakers.map((s) => (
            <option key={s.deviceId} value={s.deviceId}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>
      <div
        style={{
          padding: "var(--s-3) var(--s-4)",
          background: "color-mix(in oklch, var(--rv-live) 10%, var(--bg-elev-2))",
          border: "1px solid color-mix(in oklch, var(--rv-live) 35%, var(--border))",
          borderRadius: "var(--r-md)",
          display: "flex",
          gap: "var(--s-3)",
          alignItems: "center",
          fontSize: "var(--t-sm)",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--rv-live)",
            boxShadow: "0 0 8px var(--rv-live)",
          }}
        />
        Changes apply live — no need to rejoin.
      </div>

      <div className="rv-section-head">
        <span className="rv-label">Processing</span>
      </div>
      {/* real audio processing toggles wired in Phase 5 T13/T14 */}
      <Toggle
        label="Noise suppression"
        hint="RNNoise · removes keyboard, fans, room echo"
        defaultChecked
      />
      <Toggle label="Auto-gain control" hint="Normalize speaking level" defaultChecked />
      <Toggle
        label="Echo cancellation"
        hint="Required if you use speakers"
        defaultChecked
      />
    </div>
  );
}

function Toggle({
  label,
  hint,
  defaultChecked,
}: {
  label: string;
  hint?: string;
  defaultChecked?: boolean;
}): ReactElement {
  const [on, setOn] = useState<boolean>(!!defaultChecked);
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--s-4)",
        cursor: "pointer",
        padding: "10px 0",
        borderBottom: "1px solid var(--border-soft)",
      }}
    >
      <div>
        <div style={{ fontSize: "var(--t-sm)", fontWeight: 500 }}>{label}</div>
        {hint && (
          <div style={{ fontSize: "var(--t-xs)", color: "var(--text-faint)", marginTop: 2 }}>
            {hint}
          </div>
        )}
      </div>
      <span
        onClick={() => setOn((o) => !o)}
        style={{
          width: 36,
          height: 20,
          borderRadius: 999,
          background: on ? "var(--accent)" : "var(--bg-elev-3)",
          border:
            "1px solid " +
            (on ? "color-mix(in oklch, var(--accent) 70%, black)" : "var(--border-strong)"),
          position: "relative",
          transition: "all var(--d-base) var(--ease-out)",
          boxShadow: on ? "0 0 0 3px color-mix(in oklch, var(--accent) 25%, transparent)" : "none",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 1,
            left: on ? 17 : 1,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "var(--text)",
            transition: "left var(--d-base) var(--ease-out)",
          }}
        />
        <input
          type="checkbox"
          checked={on}
          onChange={() => {
            /* state mutates via the wrapper click */
          }}
          style={{ display: "none" }}
        />
      </span>
    </label>
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

  // only PTT is wired — others are coming soon
  const decorative: Array<[string, string]> = [
    ["Toggle mute", `${MOD_KEY} + ${SHIFT_KEY} + M`],
    ["Toggle deafen", `${MOD_KEY} + ${SHIFT_KEY} + D`],
    ["Toggle screen-share", `${MOD_KEY} + ${SHIFT_KEY} + E`],
    ["Open settings", `${MOD_KEY} + ,`],
    ["Leave room", `${MOD_KEY} + W`],
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--s-3)",
        maxWidth: 460,
      }}
    >
      <div className="rv-section-head">
        <span className="rv-label">Global keybinds</span>
      </div>

      {/* PTT — fully wired */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 0",
          borderBottom: "1px solid var(--border-soft)",
          gap: "var(--s-3)",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: "var(--t-sm)" }}>Push to talk</span>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <kbd style={kbdStyle}>{display}</kbd>
          <button
            className="rv-btn"
            data-variant="ghost"
            onClick={() => setRecording(true)}
            disabled={recording}
          >
            {recording ? "Press a key…" : "Rebind"}
          </button>
          {captured && (
            <button className="rv-btn" data-variant="primary" onClick={() => void save()}>
              Save
            </button>
          )}
          {current && !captured && (
            <button className="rv-btn" data-variant="ghost" onClick={() => void clear()}>
              Clear
            </button>
          )}
        </span>
      </div>

      {/* Decorative rows — placeholder until Phase 5 T-keybinds */}
      {decorative.map(([l, k]) => (
        <div
          key={l}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 0",
            borderBottom: "1px solid var(--border-soft)",
          }}
        >
          <span style={{ fontSize: "var(--t-sm)" }}>{l}</span>
          <span style={{ display: "flex", gap: 4 }}>
            {k.split(" + ").map((kk, i) => (
              <kbd key={i} style={kbdStyle}>
                {kk}
              </kbd>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

function CompatTab(): ReactElement {
  const enabled = usePrefs((s) => s.compatibilityMode);

  async function toggleX11(): Promise<void> {
    const next = !enabled;
    prefsActions().setCompatibilityMode(next);
    await window.redvoice.setCompatibilityEnv(next);
  }

  async function relaunch(): Promise<void> {
    await window.redvoice.relaunch();
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--s-4)",
        maxWidth: 480,
      }}
    >
      <div className="rv-section-head">
        <span className="rv-label">Hardware acceleration</span>
      </div>

      {/* X11 / Wayland — wired */}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--s-4)",
          cursor: "pointer",
          padding: "10px 0",
          borderBottom: "1px solid var(--border-soft)",
        }}
      >
        <div>
          <div style={{ fontSize: "var(--t-sm)", fontWeight: 500 }}>
            X11 compatibility mode (Linux/Wayland)
          </div>
          <div style={{ fontSize: "var(--t-xs)", color: "var(--text-faint)", marginTop: 2 }}>
            Forces Electron through XWayland. Use if screenshare glitches on Wayland. Takes effect
            after relaunch.
          </div>
        </div>
        <span
          onClick={() => void toggleX11()}
          style={{
            width: 36,
            height: 20,
            borderRadius: 999,
            background: enabled ? "var(--accent)" : "var(--bg-elev-3)",
            border:
              "1px solid " +
              (enabled
                ? "color-mix(in oklch, var(--accent) 70%, black)"
                : "var(--border-strong)"),
            position: "relative",
            transition: "all var(--d-base) var(--ease-out)",
            boxShadow: enabled
              ? "0 0 0 3px color-mix(in oklch, var(--accent) 25%, transparent)"
              : "none",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 1,
              left: enabled ? 17 : 1,
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "var(--text)",
              transition: "left var(--d-base) var(--ease-out)",
            }}
          />
        </span>
      </label>

      {/* Inert toggles per designer */}
      <Toggle label="GPU video decode (VP9 / AV1)" defaultChecked />
      <Toggle label="Use system Picture-in-Picture" />

      <div>
        <button className="rv-btn" onClick={() => void relaunch()}>
          Relaunch app
        </button>
      </div>

      <div style={{ fontSize: "var(--t-xs)", color: "var(--text-dim)" }}>
        Platform-specific notes:
        <ul style={{ marginTop: 4 }}>
          <li>
            <strong>macOS</strong>: grant Screen Recording permission in System Settings → Privacy
          </li>
          <li>
            <strong>Linux</strong>: system audio in screenshare needs PipeWire portal ≥ 1.14
          </li>
          <li>
            <strong>Windows</strong>: system audio uses "loopback" — no setup needed
          </li>
        </ul>
      </div>

      <div className="rv-section-head" style={{ marginTop: "var(--s-3)" }}>
        <span className="rv-label">Permissions</span>
      </div>
      <PermissionRows />
    </div>
  );
}

function PermissionRows(): ReactElement {
  const [mic, setMic] = useState<MediaPermissionStatus>("unknown");
  const [cam, setCam] = useState<MediaPermissionStatus>("unknown");
  const [scr, setScr] = useState<MediaPermissionStatus>("unknown");
  const isMac = window.redvoice.platform() === "darwin";

  const refresh = async (): Promise<void> => {
    const [m, c, s] = await Promise.all([
      window.redvoice.getMediaPermission("microphone"),
      window.redvoice.getMediaPermission("camera"),
      window.redvoice.getMediaPermission("screen"),
    ]);
    setMic(m);
    setCam(c);
    setScr(s);
  };

  useEffect(() => {
    void refresh();
    // Re-check on focus — user may have just toggled the OS setting.
    const onFocus = (): void => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  return (
    <>
      <PermRow
        label="Microphone"
        status={mic}
        action={
          isMac && mic !== "granted" ? (
            <button
              type="button"
              className="rv-btn"
              data-variant="ghost"
              style={{ height: "1.6rem", fontSize: "var(--t-xs)" }}
              onClick={() => {
                void window.redvoice.askMediaPermission("microphone").then(() => void refresh());
              }}
            >
              Grant
            </button>
          ) : null
        }
      />
      <PermRow
        label="Camera"
        status={cam}
        action={
          isMac && cam !== "granted" ? (
            <button
              type="button"
              className="rv-btn"
              data-variant="ghost"
              style={{ height: "1.6rem", fontSize: "var(--t-xs)" }}
              onClick={() => {
                void window.redvoice.askMediaPermission("camera").then(() => void refresh());
              }}
            >
              Grant
            </button>
          ) : null
        }
      />
      <PermRow
        label="Screen recording"
        status={scr}
        action={
          isMac && scr !== "granted" ? (
            <button
              type="button"
              className="rv-btn"
              data-variant="ghost"
              style={{ height: "1.6rem", fontSize: "var(--t-xs)" }}
              onClick={() => void window.redvoice.openMacScreenSettings()}
            >
              Open Settings
            </button>
          ) : null
        }
      />
    </>
  );
}

function PermRow({
  label,
  status,
  action,
}: {
  label: string;
  status: MediaPermissionStatus;
  action?: React.ReactNode;
}): ReactElement {
  const tone = status === "granted" ? "live" : status === "denied" ? "red" : "amber";
  const display =
    status === "not-determined"
      ? "not requested"
      : status === "granted"
        ? "granted"
        : status === "denied"
          ? "denied"
          : status === "restricted"
            ? "restricted"
            : "unknown";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "var(--s-3)",
        padding: "10px 0",
        borderBottom: "1px solid var(--border-soft)",
      }}
    >
      <span style={{ fontSize: "var(--t-sm)" }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
        {action}
        <span className="rv-badge" data-tone={tone}>
          {tone === "live" && <span className="pip" />}
          {display}
        </span>
      </span>
    </div>
  );
}

function AboutTab(): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--s-5)",
        maxWidth: 460,
      }}
    >
      <div style={{ display: "flex", gap: "var(--s-4)", alignItems: "center" }}>
        <I.Logo size={48} />
        <div>
          <div style={{ fontSize: "var(--t-xl)", fontWeight: 700, letterSpacing: "-0.01em" }}>
            RedVoice
          </div>
          <div className="rv-mono" style={{ fontSize: "var(--t-xs)", color: "var(--text-dim)" }}>
            v0.1.5 · electron 35 · chromium 130
          </div>
        </div>
      </div>
      <p style={{ color: "var(--text-mid)", lineHeight: 1.6, margin: 0 }}>
        Open-source voice + screenshare. Self-host the server, own your data, keep your raid in
        your basement. MIT licensed, no telemetry by default.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2,1fr)",
          gap: "var(--s-2)",
        }}
      >
        <a
          className="rv-btn"
          href="https://github.com/R3dWolfie/RedVoice"
          target="_blank"
          rel="noreferrer"
        >
          View on GitHub
        </a>
        <a
          className="rv-btn"
          href="https://github.com/R3dWolfie/RedVoice/issues/new"
          target="_blank"
          rel="noreferrer"
        >
          Report an issue
        </a>
        <button className="rv-btn" disabled title="Coming soon">
          Diagnostics…
        </button>
        <button className="rv-btn" disabled title="Coming soon">
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
