import { useEffect, useState, type ReactElement } from "react";

interface Release {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
}

const REPO = "R3dWolfie/RedVoice";
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases`;

export function FeaturesPanel({ onClose }: { onClose: () => void }): ReactElement {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(RELEASES_URL, { headers: { Accept: "application/vnd.github+json" } });
        if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
        const data = (await res.json()) as Release[];
        if (!cancelled) setReleases(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "failed to fetch releases");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
          width: 620,
          maxHeight: "85vh",
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
          <Group title="Released" color="var(--accent)">
            {loading && <Item icon="…">Loading releases…</Item>}
            {error && <Item icon="!">Couldn't reach GitHub: {error}</Item>}
            {!loading && !error && releases.length === 0 && <Item icon="·">No releases yet.</Item>}
            {releases.map((r) => (
              <ReleaseEntry key={r.tag_name} release={r} />
            ))}
          </Group>

          <Group title="Coming soon (Plan 5)" color="#f5a623">
            <Item icon="🔜">Installers for Windows / Linux / macOS</Item>
            <Item icon="🔜">Auto-update</Item>
            <Item icon="🔜">Deep links (redvoice://join/…)</Item>
            <Item icon="🔜">In-room text chat</Item>
            <Item icon="🔜">Picture-in-picture floating tile</Item>
            <Item icon="🔜">Network quality indicator per tile</Item>
            <Item icon="🔜">Distinctive dark UI polish</Item>
            <Item icon="🔜">Opt-in crash reporting</Item>
            <Item icon="🔜">macOS screen-recording permission onboarding</Item>
            <Item icon="🔜">Cloudflare tunnel + UDP deployment docs</Item>
            <Item icon="🔜">Webcam alongside screenshare</Item>
            <Item icon="🔜">Noise suppression (Off / Low / High)</Item>
            <Item icon="🔜">Advanced mic options (gain, AGC, noise gate)</Item>
          </Group>

          <Group title="Not planned" color="var(--text-dim)">
            <Item icon="✗">Server-side recording</Item>
            <Item icon="✗">Spatial audio</Item>
            <Item icon="✗">Publishing screenshare FROM mobile (iOS limitation)</Item>
            <Item icon="✗">Code signing (maybe later)</Item>
          </Group>

          <Group title="Future — after desktop is solid" color="#555">
            <Item icon="🌅">Mobile clients — iOS &amp; Android (voice + viewing only; won't start until Plan 5 ships + voice is stable in the wild)</Item>
          </Group>
        </div>
      </div>
    </div>
  );
}

function ReleaseEntry({ release }: { release: Release }): ReactElement {
  const date = new Date(release.published_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return (
    <li style={{ listStyle: "none", padding: 0, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <strong style={{ fontSize: 14 }}>{release.name || release.tag_name}</strong>
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{date}</span>
      </div>
      <pre
        style={{
          margin: 0,
          fontSize: 12,
          fontFamily: "inherit",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          color: "var(--text-dim)",
          background: "var(--bg)",
          padding: 10,
          borderRadius: 4,
          maxHeight: 200,
          overflowY: "auto",
        }}
      >
        {release.body || "(no notes)"}
      </pre>
    </li>
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
