import type {
  ChatMessageDTO,
  ChatThreadType,
  ChatWsCommand,
  ChatWsEvent,
} from "@redvoice/shared";
import type { ApiClient } from "./api.js";

type Listener = (event: ChatWsEvent) => void;

/**
 * Manages a single WebSocket connection for chat events. Auth via the
 * Sec-WebSocket-Protocol subprotocol "redvoice.bearer.<jwt>" — the only
 * browser-WebSocket way to ship a token without leaking it in the URL.
 *
 * Owns reconnect on transient drops with exponential backoff.
 * Subscriptions are remembered so we re-subscribe after a reconnect.
 */
export class ChatTransport {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private subscribed = new Set<string>(); // "type:id"
  private serverUrl: string;
  private token: string;
  private closed = false;
  private reconnectDelay = 1000;
  private heartbeatTimer: number | null = null;

  constructor(serverUrl: string, token: string, _api: ApiClient) {
    this.serverUrl = serverUrl;
    this.token = token;
  }

  start(): void {
    if (this.closed) return;
    this.connect();
  }

  stop(): void {
    this.closed = true;
    if (this.heartbeatTimer != null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* noop */
      }
      this.ws = null;
    }
  }

  on(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  subscribe(threadType: ChatThreadType, threadId: string): void {
    this.subscribed.add(`${threadType}:${threadId}`);
    this.sendCmd({ type: "subscribe", threadType, threadId });
  }

  unsubscribe(threadType: ChatThreadType, threadId: string): void {
    this.subscribed.delete(`${threadType}:${threadId}`);
    this.sendCmd({ type: "unsubscribe", threadType, threadId });
  }

  private connect(): void {
    const wsUrl = httpToWs(this.serverUrl) + "/ws";
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl, [`redvoice.bearer.${this.token}`]);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.reconnectDelay = 1000;
      // Re-subscribe everything we cared about.
      for (const k of this.subscribed) {
        const [t, ...rest] = k.split(":");
        const id = rest.join(":");
        if (t === "room" || t === "dm") {
          this.sendCmd({ type: "subscribe", threadType: t, threadId: id });
        }
      }
      // Heartbeat every 25s — keeps NAT mappings + tunnel alive.
      this.heartbeatTimer = window.setInterval(() => {
        this.sendCmd({ type: "ping" });
      }, 25000);
    });

    ws.addEventListener("message", (msg) => {
      try {
        const event = JSON.parse(typeof msg.data === "string" ? msg.data : "") as ChatWsEvent;
        this.listeners.forEach((l) => l(event));
      } catch {
        /* drop malformed */
      }
    });

    ws.addEventListener("close", () => {
      if (this.heartbeatTimer != null) {
        window.clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      this.ws = null;
      if (!this.closed) this.scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      // Let close handler run; nothing to do here.
    });
  }

  private sendCmd(cmd: ChatWsCommand): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(cmd));
    } catch {
      /* socket may be closing */
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(this.reconnectDelay, 30000);
    window.setTimeout(() => {
      if (!this.closed) this.connect();
    }, delay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
  }
}

function httpToWs(url: string): string {
  if (url.startsWith("https://")) return "wss://" + url.slice("https://".length);
  if (url.startsWith("http://")) return "ws://" + url.slice("http://".length);
  return url;
}

export type { ChatMessageDTO };
