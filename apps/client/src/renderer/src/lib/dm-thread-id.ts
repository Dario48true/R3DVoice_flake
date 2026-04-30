/**
 * Canonical-pair encoding for DM thread IDs. Sorting the two user IDs
 * lexically means both participants resolve the same threadId without
 * coordinating, and the server can match either half via prefix/suffix.
 */
export function dmThreadId(userIdA: string, userIdB: string): string {
  return userIdA < userIdB ? `${userIdA}:${userIdB}` : `${userIdB}:${userIdA}`;
}

export function otherParticipantId(threadId: string, callerId: string): string {
  const [a, b] = threadId.split(":");
  if (a === callerId) return b!;
  return a!;
}
