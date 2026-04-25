import { useState, type ReactElement } from "react";
import { Modal } from "./Modal.js";
import { I } from "./Icons.js";
import { PUBLIC_SERVERS, type PublicServerEntry } from "../data/public-servers.js";

interface Props {
  open: boolean;
  onClose: () => void;
  onPick(url: string): void;
}

const SUBMIT_URL =
  "https://github.com/R3dWolfie/RedVoice/issues/new?title=%5BServer%20Listing%5D%20<your-server-name>&body=" +
  encodeURIComponent(
    "Server name:\nServer URL (https://...):\nDescription:\nOperator (your handle):\nRegion (EU/US/Asia/...):\nInvite-only? (yes/no):\n",
  );

export function PublicServersModal({ open, onClose, onPick }: Props): ReactElement {
  const [filter, setFilter] = useState("");
  const filtered = filterServers(PUBLIC_SERVERS, filter);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Public servers"
      subtitle="CURATED · CLICK TO USE"
      width="min(94vw, 640px)"
    >
      <div style={{ padding: "var(--s-5) var(--s-6)", display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
        <input
          className="rv-input"
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />

        {filtered.length === 0 ? (
          <div style={{ padding: "var(--s-6)", textAlign: "center", color: "var(--text-faint)" }}>
            No servers match. Try a different filter or submit yours below.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
            {filtered.map((s) => (
              <ServerCard
                key={s.url}
                entry={s}
                onPick={() => {
                  onPick(s.url);
                  onClose();
                }}
              />
            ))}
          </div>
        )}

        <hr className="rv-rule" />

        <div style={{ fontSize: "var(--t-xs)", color: "var(--text-mid)", lineHeight: 1.5 }}>
          Want your server here? Submissions are manually reviewed and ship in the next client
          release. Click below to open a templated GitHub issue.
        </div>
        <div>
          <button
            type="button"
            className="rv-btn"
            data-variant="ghost"
            onClick={() => void window.redvoice.openExternal(SUBMIT_URL)}
          >
            <I.Plus size={14} /> Submit your server
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ServerCard({ entry, onPick }: { entry: PublicServerEntry; onPick: () => void }): ReactElement {
  return (
    <button
      type="button"
      onClick={onPick}
      className="rv-card"
      style={{
        textAlign: "left",
        padding: "var(--s-4) var(--s-5)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: "var(--s-2)",
        border: "1px solid var(--border-soft)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--s-3)", flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, fontSize: "var(--t-md)" }}>{entry.name}</span>
        {entry.region && (
          <span className="rv-badge">
            <span className="rv-mono">{entry.region}</span>
          </span>
        )}
        {entry.inviteOnly && <span className="rv-badge" data-tone="amber">invite-only</span>}
      </div>
      <span className="rv-mono" style={{ fontSize: "var(--t-xs)", color: "var(--text-faint)" }}>
        {entry.url}
      </span>
      <span style={{ fontSize: "var(--t-sm)", color: "var(--text-mid)" }}>{entry.description}</span>
      <span style={{ fontSize: "var(--t-xs)", color: "var(--text-faint)" }}>by {entry.operator}</span>
    </button>
  );
}

function filterServers(list: PublicServerEntry[], query: string): PublicServerEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.url.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.operator.toLowerCase().includes(q) ||
      (s.region ?? "").toLowerCase().includes(q),
  );
}
