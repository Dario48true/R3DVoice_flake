import { type ReactElement } from "react";
import type { DmThreadEntry } from "@redvoice/shared";

type Props = {
  threads: DmThreadEntry[];
  activeThreadId: string | null;
  onSelect(threadId: string): void;
};

function avatarTone(seed: string): 1 | 2 | 3 | 4 | 5 {
  return ((seed.charCodeAt(0) % 5) + 1) as 1 | 2 | 3 | 4 | 5;
}

export function DmThreadList({ threads, activeThreadId, onSelect }: Props): ReactElement {
  if (threads.length === 0) {
    return (
      <div style={{ padding: "var(--s-4)", color: "var(--text-faint)", fontSize: "var(--t-sm)" }}>
        No conversations yet.
      </div>
    );
  }
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {threads.map((t) => {
        const active = t.threadId === activeThreadId;
        const peer = t.otherParticipant;
        const headline = peer.handle ? `@${peer.handle}` : peer.displayName;
        return (
          <li
            key={t.threadId}
            onClick={() => onSelect(t.threadId)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--s-3)",
              padding: "var(--s-2) var(--s-3)",
              borderRadius: "var(--r-md)",
              cursor: "pointer",
              background: active ? "color-mix(in oklch, var(--accent) 14%, transparent)" : "transparent",
              border: active ? "1px solid var(--accent)" : "1px solid transparent",
            }}
          >
            <span
              className="rv-avatar"
              data-tone={avatarTone(peer.id)}
              style={{ width: 32, height: 32, fontSize: 13, flexShrink: 0 }}
            >
              {(peer.displayName.charAt(0) || "?").toUpperCase()}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: "var(--t-sm)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {headline}
              </div>
              <div style={{ fontSize: "var(--t-xs)", color: "var(--text-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {t.lastMessage.body ?? "(deleted)"}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
