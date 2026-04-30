import { prisma } from "../db.js";

const MAX_LEN = 20;
const FALLBACK = "user";

/**
 * Slugify and pick a handle that doesn't collide with an existing user.
 * Algorithm: lowercase → replace whitespace with `_` → strip everything
 * outside [a-z0-9_] → truncate to 20 chars → fall back to "user" if empty
 * → append `_2`, `_3`, ... until handleLower is unique.
 */
export async function generateUniqueHandle(displayName: string): Promise<string> {
  const base = slug(displayName);
  let candidate = base;
  let n = 2;
  while (await isTaken(candidate)) {
    const suffix = `_${n}`;
    const room = MAX_LEN - suffix.length;
    candidate = base.slice(0, room) + suffix;
    n += 1;
  }
  return candidate;
}

function slug(input: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, MAX_LEN);
  return cleaned.length > 0 ? cleaned : FALLBACK;
}

async function isTaken(candidate: string): Promise<boolean> {
  const hit = await prisma.user.findUnique({
    where: { handleLower: candidate },
    select: { id: true },
  });
  return hit !== null;
}
