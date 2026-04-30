import { prisma } from "../db.js";

export interface UnreadCounts {
  counts: Record<string, number>;
  totalUnread: number;
}

/**
 * Compute unread counts for a user across all DM threads they're part of.
 *
 * Logic:
 *   - For each DM thread the user participates in, find lastReadAt (or
 *     epoch if no marker exists).
 *   - Count messages in that thread, NOT authored by the user, with
 *     createdAt > lastReadAt.
 *
 * Mute integration:
 *   - level=none → 0 contribution.
 *   - level=mentions → only messages mentioning the user count.
 *   - level=all (default) → all unread messages count.
 */
export async function computeUnread(userId: string): Promise<UnreadCounts> {
  const counts: Record<string, number> = {};
  let total = 0;

  const dmRows = await prisma.message.findMany({
    where: {
      threadType: "dm",
      OR: [{ threadId: { startsWith: `${userId}:` } }, { threadId: { endsWith: `:${userId}` } }],
    },
    select: { threadId: true },
    distinct: ["threadId"],
  });
  const dmThreadIds = dmRows.map((r) => r.threadId);

  const reads = await prisma.threadReadState.findMany({
    where: { userId, threadType: "dm", threadId: { in: dmThreadIds } },
  });
  const readByThread = new Map(reads.map((r) => [r.threadId, r.lastReadAt]));

  const mutes = await prisma.threadMuteState.findMany({
    where: { userId, threadType: "dm", threadId: { in: dmThreadIds } },
  });
  const muteByThread = new Map(mutes.map((m) => [m.threadId, m]));

  for (const threadId of dmThreadIds) {
    const mute = muteByThread.get(threadId);
    if (mute?.level === "none") continue;

    const lastRead = readByThread.get(threadId) ?? new Date(0);
    const messages = await prisma.message.findMany({
      where: {
        threadType: "dm",
        threadId,
        authorId: { not: userId },
        createdAt: { gt: lastRead },
      },
      select: { id: true, mentions: true },
    });

    let n = messages.length;
    if (mute?.level === "mentions") {
      n = messages.filter((m) => {
        if (!m.mentions) return false;
        try {
          const arr = JSON.parse(m.mentions) as string[];
          return arr.includes(userId);
        } catch {
          return false;
        }
      }).length;
    }
    if (n > 0) {
      counts[`dm:${threadId}`] = n;
      total += n;
    }
  }

  return { counts, totalUnread: total };
}
