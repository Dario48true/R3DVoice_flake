import { useEffect, useState, type ReactElement } from "react";
import { Modal } from "./Modal.js";
import { Spinner } from "./Primitives.js";

interface Release {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
}

const REPO = "R3dWolfie/RedVoice";
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases`;

const COMING_SOON: readonly string[] = [
  "Deep links · redvoice://join/…",
  "In-room text chat",
  "Picture-in-picture floating tile",
  "Network quality per tile",
  "Opt-in crash reporting",
  "macOS recording onboarding",
  "Self-host deployment guide",
  "Webcam alongside screenshare",
  "Noise suppression (Off / Low / High)",
  "Advanced mic options",
  "Email verification",
  "Password reset",
  "Two-factor auth (TOTP)",
];

const LONG_HORIZON: readonly string[] = [
  "Federation between self-hosted servers",
  "End-to-end encrypted DMs",
  "Web client at voice.r3dwolfie.com (Plan 7)",
  "Mobile clients — iOS & Android (Plan 6)",
  "Soundboard with hotkeys",
  "Theming system",
  "Plugin API",
  "Spatial audio (not planned)",
  "Server-side recording (not planned)",
];

function formatReleaseDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function extractNotes(body: string): string[] {
  const lines = body.split(/\r?\n/);
  const bullets = lines
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- ") || l.startsWith("* "))
    .map((l) => l.slice(2).trim())
    .filter((l) => l.length > 0);
  if (bullets.length > 0) return bullets;
  return lines
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 5);
}

function stripV(tag: string): string {
  return tag.startsWith("v") || tag.startsWith("V") ? tag.slice(1) : tag;
}

export function FeaturesPanel({ onClose }: { onClose: () => void }): ReactElement {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async (): Promise<void> => {
      try {
        const res = await fetch(RELEASES_URL, {
          headers: { Accept: "application/vnd.github+json" },
        });
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
    <Modal
      open={true}
      onClose={onClose}
      title="Changelog & roadmap"
      subtitle="REDVOICE · WHAT'S SHIPPED · WHAT'S NEXT"
      width="min(94vw, 760px)"
    >
      <div
        style={{
          padding: "var(--s-6) var(--s-7)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--s-7)",
        }}
      >
        {/* Released */}
        <section>
          <div className="rv-section-head">
            <span className="rv-badge" data-tone="live">
              <span className="pip" /> released
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
            {loading && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--s-3)",
                  color: "var(--text-dim)",
                }}
              >
                <Spinner />
                <span className="rv-mono" style={{ fontSize: "var(--t-xs)" }}>
                  Loading…
                </span>
              </div>
            )}
            {error && (
              <div
                style={{
                  padding: "var(--s-4)",
                  background: "color-mix(in oklch, var(--accent) 10%, var(--bg-elev-2))",
                  border: "1px solid color-mix(in oklch, var(--accent) 35%, var(--border))",
                  borderRadius: "var(--r-md)",
                  color: "var(--accent-glow)",
                  fontSize: "var(--t-sm)",
                }}
              >
                Couldn't reach GitHub: {error}
              </div>
            )}
            {!loading && !error && releases.length === 0 && (
              <div style={{ color: "var(--text-dim)", fontSize: "var(--t-sm)" }}>
                No releases yet.
              </div>
            )}
            {releases.map((r) => (
              <ReleaseEntry
                key={r.tag_name}
                version={stripV(r.tag_name)}
                date={formatReleaseDate(r.published_at)}
                notes={extractNotes(r.body || "")}
              />
            ))}
          </div>
        </section>

        {/* Coming soon */}
        <section>
          <div className="rv-section-head">
            <span className="rv-badge" data-tone="amber">
              <span className="pip" /> coming soon · plan 5
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "var(--s-2)",
            }}
          >
            {COMING_SOON.map((t) => (
              <div
                key={t}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  border: "1px dashed var(--border)",
                  borderRadius: "var(--r-md)",
                  color: "var(--text-mid)",
                  fontSize: "var(--t-sm)",
                }}
              >
                <span
                  className="rv-mono"
                  style={{
                    fontSize: 9,
                    padding: "2px 5px",
                    borderRadius: 3,
                    background: "color-mix(in oklch, var(--rv-amber) 15%, var(--bg-elev-2))",
                    color: "var(--rv-amber)",
                    border: "1px solid color-mix(in oklch, var(--rv-amber) 40%, var(--border))",
                    letterSpacing: ".1em",
                  }}
                >
                  SOON
                </span>
                {t}
              </div>
            ))}
          </div>
        </section>

        {/* Long horizon */}
        <section>
          <div className="rv-section-head">
            <span className="rv-badge">
              <span
                className="pip"
                style={{ background: "var(--text-faint)", boxShadow: "none" }}
              />{" "}
              long horizon
            </span>
          </div>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              color: "var(--text-dim)",
              fontSize: "var(--t-sm)",
              lineHeight: 1.9,
              columns: 2,
              columnGap: "var(--s-7)",
            }}
          >
            {LONG_HORIZON.map((t) => (
              <li key={t}>· {t}</li>
            ))}
          </ul>
        </section>
      </div>
    </Modal>
  );
}

function ReleaseEntry({
  version,
  tagline,
  date,
  notes,
}: {
  version: string;
  tagline?: string;
  date: string;
  notes: string[];
}): ReactElement {
  return (
    <div
      style={{
        padding: "var(--s-5)",
        background: "color-mix(in oklch, var(--bg-elev-2) 70%, transparent)",
        border: "1px solid var(--border-soft)",
        borderRadius: "var(--r-md)",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "var(--s-3)",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            fontSize: "var(--t-md)",
            background: "linear-gradient(100deg, var(--accent-glow), var(--accent))",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          v{version}
        </span>
        {tagline && (
          <span style={{ fontSize: "var(--t-sm)", color: "var(--text)", fontWeight: 500 }}>
            — {tagline}
          </span>
        )}
        <span
          className="rv-mono"
          style={{
            marginLeft: "auto",
            fontSize: "var(--t-2xs)",
            color: "var(--text-faint)",
          }}
        >
          {date}
        </span>
      </div>
      <ul
        style={{
          margin: "var(--s-3) 0 0",
          padding: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {notes.map((n, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              gap: 10,
              fontSize: "var(--t-sm)",
              color: "var(--text-mid)",
            }}
          >
            <span
              style={{
                color: "var(--accent)",
                fontFamily: "var(--font-mono)",
                flex: "none",
              }}
            >
              ↳
            </span>
            {n}
          </li>
        ))}
      </ul>
    </div>
  );
}
