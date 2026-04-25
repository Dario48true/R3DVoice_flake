import type { WebSocket } from "ws";
import type { ThreadType } from "./threads.js";

/**
 * In-memory subscription registry. Maps `${threadType}:${threadId}` → set of
 * sockets currently listening. Process-local (single-process server) — for
 * multi-process deployments, swap this for a Redis pub/sub backend.
 */

interface ConnectedSocket {
  socket: WebSocket;
  userId: string;
}

const subscriptions = new Map<string, Set<ConnectedSocket>>();

function key(threadType: ThreadType, threadId: string): string {
  return `${threadType}:${threadId}`;
}

export function subscribe(
  threadType: ThreadType,
  threadId: string,
  conn: ConnectedSocket,
): void {
  const k = key(threadType, threadId);
  let set = subscriptions.get(k);
  if (!set) {
    set = new Set();
    subscriptions.set(k, set);
  }
  set.add(conn);
}

export function unsubscribe(
  threadType: ThreadType,
  threadId: string,
  conn: ConnectedSocket,
): void {
  const set = subscriptions.get(key(threadType, threadId));
  if (!set) return;
  set.delete(conn);
  if (set.size === 0) subscriptions.delete(key(threadType, threadId));
}

export function unsubscribeAll(conn: ConnectedSocket): void {
  for (const [k, set] of subscriptions) {
    set.delete(conn);
    if (set.size === 0) subscriptions.delete(k);
  }
}

export function broadcastToThread(
  threadType: ThreadType,
  threadId: string,
  payload: unknown,
): void {
  const set = subscriptions.get(key(threadType, threadId));
  if (!set || set.size === 0) return;
  const data = JSON.stringify(payload);
  for (const conn of set) {
    try {
      conn.socket.send(data);
    } catch {
      // Socket might be in a half-closed state — drop silently. The close
      // handler will clean it up.
    }
  }
}

export type { ConnectedSocket };
