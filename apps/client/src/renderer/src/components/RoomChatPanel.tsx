import { useEffect, useRef, useState, type ReactElement } from "react";
import type { ChatMessageDTO } from "@redvoice/shared";
import { ApiClient } from "../lib/api.js";
import { ChatTransport } from "../lib/chat-transport.js";
import { useAuthStore } from "../lib/auth-context.js";
import { I } from "./Icons.js";

interface Props {
  threadType: "room" | "dm";
  threadId: string;
  localIdentity: string;
  localName: string;
  onClose(): void;
}

// Persistent chat panel backed by REST + WebSocket (P5 T20).
// LiveKit DataChannel is no longer the transport — every message round-trips
// through the server so it shows up in the user's history regardless of
// whether they were online when sent.
export function RoomChatPanel({
  threadType,
  threadId,
  localIdentity,
  localName,
  onClose,
}: Props): ReactElement {
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const token = useAuthStore((s) => s.token);

  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [draft, setDraft] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const apiRef = useRef<ApiClient | null>(null);
  const transportRef = useRef<ChatTransport | null>(null);

  // Build a thread-scoped API + transport. Re-initialized when the
  // thread/server/token changes.
  useEffect(() => {
    if (!token) return;
    const api = new ApiClient(serverUrl);
    api.setToken(token);
    apiRef.current = api;

    const transport = new ChatTransport(serverUrl, token, api);
    transportRef.current = transport;

    let cancelled = false;
    void api
      .chatHistory(threadType, threadId, { limit: 50 })
      .then((res) => {
        if (!cancelled) setMessages(res.messages);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });

    const off = transport.on((event) => {
      if (event.type === "message") {
        if (event.message.threadType === threadType && event.message.threadId === threadId) {
          setMessages((prev) => [...prev, event.message]);
        }
      } else if (event.type === "edited") {
        if (event.message.threadType === threadType && event.message.threadId === threadId) {
          setMessages((prev) => prev.map((m) => (m.id === event.message.id ? event.message : m)));
        }
      } else if (event.type === "deleted") {
        if (event.threadType === threadType && event.threadId === threadId) {
          setMessages((prev) =>
            prev.map((m) => (m.id === event.id ? { ...m, body: null, deletedAt: new Date().toISOString() } : m)),
          );
        }
      }
    });

    transport.start();
    transport.subscribe(threadType, threadId);

    return () => {
      cancelled = true;
      off();
      transport.unsubscribe(threadType, threadId);
      transport.stop();
      apiRef.current = null;
      transportRef.current = null;
    };
  }, [serverUrl, token, threadType, threadId]);

  // Auto-scroll on new message (only if user is near the bottom).
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = async (): Promise<void> => {
    const text = draft.trim();
    if (!text || !apiRef.current) return;
    setDraft("");
    setEmojiOpen(false);
    setError(null);
    inputRef.current?.focus();
    try {
      // The server broadcasts back over WS so we'll see our own message arrive
      // there. No local echo needed.
      await apiRef.current.chatSend({ threadType, threadId, body: text });
    } catch (e) {
      setError(e instanceof Error ? e.message : "send failed");
      // Restore draft so the user doesn't lose their text on a network blip.
      setDraft(text);
    }
  };

  const insertEmoji = (e: string): void => {
    setDraft((d) => d + e);
    inputRef.current?.focus();
  };

  // Reference localIdentity/localName for "you" styling without warnings; both
  // come from props but we don't need them after the rewrite. Keep around for
  // future per-author UI tweaks.
  void localIdentity;
  void localName;

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
          </div>
        ) : (
          messages.map((m) => <ChatBubble key={m.id} msg={m} />)
        )}
        {error && (
          <div
            style={{
              color: "var(--accent-glow)",
              fontSize: "var(--t-xs)",
              padding: "var(--s-2) var(--s-3)",
              border: "1px solid color-mix(in oklch, var(--accent) 40%, transparent)",
              borderRadius: "var(--r-sm)",
              background: "color-mix(in oklch, var(--accent) 8%, var(--bg-elev-2))",
            }}
          >
            {error}
          </div>
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

function ChatBubble({ msg }: { msg: ChatMessageDTO }): ReactElement {
  const time = new Date(msg.createdAt).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const deleted = msg.deletedAt !== null || msg.body === null;
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
        <span style={{ fontWeight: 600, color: "var(--text)" }}>{msg.authorName}</span>
        <span className="rv-mono" style={{ color: "var(--text-faint)", fontSize: "var(--t-2xs)" }}>
          {time}
        </span>
        {msg.editedAt && !deleted && (
          <span style={{ color: "var(--text-faint)", fontSize: "var(--t-2xs)" }}>(edited)</span>
        )}
      </div>
      <div
        style={{
          fontSize: "var(--t-sm)",
          color: deleted ? "var(--text-faint)" : "var(--text-mid)",
          wordBreak: "break-word",
          lineHeight: 1.4,
          fontStyle: deleted ? "italic" : "normal",
        }}
      >
        {deleted ? "(deleted)" : msg.body}
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

