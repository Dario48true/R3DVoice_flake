import { useEffect, useRef, useState, type ReactElement } from "react";
import type { LiveKitRoom } from "../lib/livekit-room.js";
import { I } from "./Icons.js";

interface ChatMessage {
  id: string;
  from: string;
  fromName: string;
  text: string;
  ts: number;
  local: boolean;
}

interface Props {
  room: LiveKitRoom;
  localIdentity: string;
  localName: string;
  onClose(): void;
}

// Small ephemeral chat panel powered by LiveKit DataChannel. Persistence comes
// in P5 T20 — the renderer surface stays the same; only the transport swaps.
export function RoomChatPanel({ room, localIdentity, localName, onClose }: Props): ReactElement {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return room.onChat((msg) =>
      setMessages((prev) => [...prev, { ...msg, id: cryptoId() }]),
    );
  }, [room]);

  // Auto-scroll on new message (only if user is near the bottom; don't yank
  // the scroll if they're reading older context).
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = async (): Promise<void> => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    setEmojiOpen(false);
    inputRef.current?.focus();
    // LiveKit DataChannel doesn't echo to sender — append locally so the user
    // sees their own message immediately.
    setMessages((prev) => [
      ...prev,
      {
        id: cryptoId(),
        from: localIdentity,
        fromName: localName,
        text,
        ts: Date.now(),
        local: true,
      },
    ]);
    await room.sendChat(text);
  };

  const insertEmoji = (e: string): void => {
    setDraft((d) => d + e);
    inputRef.current?.focus();
  };

  return (
    <aside
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: 320,
        zIndex: 40,
        background: "color-mix(in oklch, var(--rv-ink-0) 92%, transparent)",
        borderLeft: "1px solid var(--border-soft)",
        backdropFilter: "blur(10px)",
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        animation: "rv-fade var(--d-mid) var(--ease-out) both",
      }}
    >
      <header
        style={{
          padding: "var(--s-3) var(--s-4)",
          borderBottom: "1px solid var(--border-soft)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
          <I.Chat size={14} />
          <span className="rv-label">Room chat</span>
          <span
            className="rv-mono"
            style={{ fontSize: "var(--t-2xs)", color: "var(--text-faint)" }}
          >
            ephemeral
          </span>
        </div>
        <button
          type="button"
          className="rv-btn rv-btn-icon"
          data-variant="ghost"
          onClick={onClose}
          aria-label="Close chat"
        >
          <I.X size={14} />
        </button>
      </header>

      <div
        ref={listRef}
        className="rv-scroll"
        style={{
          padding: "var(--s-4)",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "var(--s-3)",
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              color: "var(--text-faint)",
              fontSize: "var(--t-xs)",
              textAlign: "center",
              padding: "var(--s-5) 0",
              lineHeight: 1.5,
            }}
          >
            No messages yet.
            <br />
            Persistent history coming in T20.
          </div>
        ) : (
          messages.map((m) => <ChatBubble key={m.id} msg={m} />)
        )}
      </div>

      <footer
        style={{
          padding: "var(--s-3) var(--s-4)",
          borderTop: "1px solid var(--border-soft)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--s-2)",
          position: "relative",
        }}
      >
        {emojiOpen && <EmojiPicker onPick={insertEmoji} />}
        <div style={{ display: "flex", gap: "var(--s-2)", alignItems: "center" }}>
          <button
            type="button"
            className="rv-btn rv-btn-icon"
            data-variant="ghost"
            onClick={() => setEmojiOpen((o) => !o)}
            aria-label="Emoji"
            data-active={emojiOpen}
          >
            <I.Smile size={16} />
          </button>
          <input
            ref={inputRef}
            className="rv-input"
            placeholder="Message…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="rv-btn rv-btn-icon"
            data-variant="primary"
            onClick={() => void send()}
            disabled={!draft.trim()}
            aria-label="Send"
          >
            <I.Send size={16} />
          </button>
        </div>
      </footer>
    </aside>
  );
}

function ChatBubble({ msg }: { msg: ChatMessage }): ReactElement {
  const time = new Date(msg.ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "var(--s-2)",
          fontSize: "var(--t-xs)",
        }}
      >
        <span style={{ fontWeight: 600, color: msg.local ? "var(--accent-glow)" : "var(--text)" }}>
          {msg.fromName}
        </span>
        <span className="rv-mono" style={{ color: "var(--text-faint)", fontSize: "var(--t-2xs)" }}>
          {time}
        </span>
      </div>
      <div
        style={{
          fontSize: "var(--t-sm)",
          color: "var(--text-mid)",
          wordBreak: "break-word",
          lineHeight: 1.4,
        }}
      >
        {msg.text}
      </div>
    </div>
  );
}

const EMOJI_SET = [
  "👍", "❤️", "😂", "🔥", "😎", "🎉", "🤔", "👀",
  "🙌", "💯", "✅", "❌", "🚀", "🎯", "👋", "😅",
  "😭", "🥺", "😈", "💀", "🤝", "💪", "🙏", "✨",
];

function EmojiPicker({ onPick }: { onPick: (e: string) => void }): ReactElement {
  return (
    <div
      style={{
        position: "absolute",
        bottom: "calc(100% - var(--s-2))",
        left: "var(--s-3)",
        right: "var(--s-3)",
        background: "var(--bg-elev-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        padding: "var(--s-2)",
        display: "grid",
        gridTemplateColumns: "repeat(8, 1fr)",
        gap: 2,
        boxShadow: "var(--shadow-2)",
      }}
    >
      {EMOJI_SET.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onPick(e)}
          style={{
            appearance: "none",
            background: "transparent",
            border: 0,
            padding: 4,
            fontSize: 18,
            cursor: "pointer",
            borderRadius: "var(--r-sm)",
          }}
          onMouseEnter={(ev) => (ev.currentTarget.style.background = "var(--bg-elev-3)")}
          onMouseLeave={(ev) => (ev.currentTarget.style.background = "transparent")}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

function cryptoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}
