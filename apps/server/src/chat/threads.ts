/**
 * Thread-id helpers. DMs use a canonical-pair encoding so both participants
 * resolve the same threadId regardless of who initiated.
 */

export type ThreadType = "room" | "dm";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Canonical DM thread id from two user-ids. Order-independent: both
 * participants compute the same string regardless of argument order.
 */
export function dmThreadId(userIdA: string, userIdB: string): string {
  if (!UUID_RE.test(userIdA) || !UUID_RE.test(userIdB)) {
    throw new Error("dmThreadId: both arguments must be UUIDs");
  }
  if (userIdA === userIdB) {
    throw new Error("dmThreadId: cannot DM yourself");
  }
  const [a, b] = userIdA < userIdB ? [userIdA, userIdB] : [userIdB, userIdA];
  return `${a}:${b}`;
}

/** Returns true when the user-id is one of the two canonical-pair members. */
export function isDmParticipant(threadId: string, userId: string): boolean {
  const parts = threadId.split(":");
  if (parts.length !== 2) return false;
  return parts[0] === userId || parts[1] === userId;
}

/** Returns the OTHER user in a DM thread (the one that isn't `selfId`). */
export function dmOtherParticipant(threadId: string, selfId: string): string | null {
  const parts = threadId.split(":");
  if (parts.length !== 2) return null;
  if (parts[0] === selfId) return parts[1] ?? null;
  if (parts[1] === selfId) return parts[0] ?? null;
  return null;
}

export function isThreadType(s: unknown): s is ThreadType {
  return s === "room" || s === "dm";
}
