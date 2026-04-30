import { useEffect, useState, type ReactElement } from "react";

type Candidate = { id: string; handle: string; displayName: string };

type Props = {
  /** Substring after the @ that the user has typed so far. */
  query: string;
  /** Candidates to filter (caller provides the participant set). */
  candidates: Candidate[];
  onPick(candidate: Candidate): void;
  onCancel(): void;
};

export function MentionAutocomplete({ query, candidates, onPick, onCancel }: Props): ReactElement | null {
  const [highlight, setHighlight] = useState(0);
  const filtered = candidates
    .filter((c) => c.handle.toLowerCase().startsWith(query.toLowerCase()))
    .slice(0, 8);

  useEffect(() => { setHighlight(0); }, [query]);
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(filtered.length - 1, h + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(0, h - 1)); }
      else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); if (filtered[highlight]) onPick(filtered[highlight]!); }
      else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, highlight, onPick, onCancel]);

  if (filtered.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: "100%",
        left: 0,
        marginBottom: 4,
        background: "var(--bg-elev-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        boxShadow: "var(--shadow-2)",
        minWidth: 240,
        maxHeight: 240,
        overflow: "auto",
        zIndex: 30,
      }}
    >
      {filtered.map((c, i) => (
        <div
          key={c.id}
          onMouseDown={(e) => { e.preventDefault(); onPick(c); }}
          style={{
            padding: "var(--s-2) var(--s-3)",
            background: i === highlight ? "color-mix(in oklch, var(--accent) 18%, transparent)" : "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "var(--s-2)",
          }}
        >
          <span style={{ fontWeight: 500 }}>@{c.handle}</span>
          <span style={{ color: "var(--text-faint)", fontSize: "var(--t-sm)" }}>{c.displayName}</span>
        </div>
      ))}
    </div>
  );
}
