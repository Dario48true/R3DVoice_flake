import { useEffect, type ReactElement } from "react";

export function FeaturesPanel({ onClose }: { onClose: () => void }): ReactElement {
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
          width: 560,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <strong>RedVoice · Changelog & Roadmap</strong>
          <button
            className="btn secondary"
            onClick={onClose}
            style={{ border: "none", background: "transparent", padding: "4px 10px" }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 20 }}>
          <Group title="Shipped" color="var(--accent)">
            <Item icon="✓">Accounts + persistent rooms</Item>
            <Item icon="✓">Screenshare up to 4K / 60fps</Item>
            <Item icon="✓">Stream audio (system audio) on Windows</Item>
            <Item icon="✓">Pre-join device check with live mic meter</Item>
            <Item icon="✓">Participant tiles with talking ring</Item>
            <Item icon="✓">Maximize a tile with double-click</Item>
            <Item icon="✓">Right-click a tile for per-person volume</Item>
            <Item icon="✓">Session persists across app restarts</Item>
          </Group>

          <Group title="Coming soon" color="#f5a623">
            <Item icon="🔜">Working voice with mute/unmute</Item>
            <Item icon="🔜">Settings modal (the gear icon)</Item>
            <Item icon="🔜">Remember last-used devices + resolution</Item>
            <Item icon="🔜">Proper screen picker with thumbnails</Item>
            <Item icon="🔜">Hot-swap mic/speaker without rejoining</Item>
            <Item icon="🔜">Configurable global push-to-talk hotkey</Item>
            <Item icon="🔜">Sharp 4K rendering on HiDPI displays</Item>
            <Item icon="🔜">Participant sidebar + who's-sharing indicator</Item>
            <Item icon="🔜">Copy-room-link button</Item>
            <Item icon="🔜">X11 compatibility toggle (Wayland workaround)</Item>
          </Group>

          <Group title="Later" color="var(--text-dim)">
            <Item icon="📅">In-room text chat</Item>
            <Item icon="📅">Picture-in-picture floating tile</Item>
            <Item icon="📅">Network quality indicator per tile</Item>
            <Item icon="📅">Distinctive dark UI polish</Item>
            <Item icon="📅">Deep links (redvoice://join/…)</Item>
            <Item icon="📅">Auto-update</Item>
            <Item icon="📅">Installers for Windows / Linux / macOS</Item>
            <Item icon="📅">Opt-in crash reporting</Item>
            <Item icon="📅">macOS screen-recording permission onboarding</Item>
            <Item icon="📅">Cloudflare tunnel + UDP deployment docs</Item>
          </Group>

          <Group title="Not planned" color="var(--text-dim)">
            <Item icon="✗">Server-side recording</Item>
            <Item icon="✗">Noise suppression / spatial audio</Item>
            <Item icon="✗">Mobile clients</Item>
            <Item icon="✗">Code signing (maybe later)</Item>
          </Group>
        </div>
      </div>
    </div>
  );
}

function Group({
  title,
  color,
  children,
}: {
  title: string;
  color: string;
  children: React.ReactNode;
}): ReactElement {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color,
          marginBottom: 8,
          fontWeight: 600,
        }}
      >
        {title}
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        {children}
      </ul>
    </div>
  );
}

function Item({ icon, children }: { icon: string; children: React.ReactNode }): ReactElement {
  return (
    <li style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13 }}>
      <span style={{ width: 18, textAlign: "center" }}>{icon}</span>
      <span>{children}</span>
    </li>
  );
}
