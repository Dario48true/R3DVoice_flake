import { create } from "zustand";
import { ApiClient } from "./api.js";

interface UnreadStore {
  counts: Record<string, number>;
  totalUnread: number;
  refresh(api: ApiClient): Promise<void>;
  /** Optimistically clear a thread's count (called on local thread-open). */
  clearThread(threadType: "room" | "dm", threadId: string): void;
  /** Bump a thread's count by 1 (called on incoming WS chat.message). */
  bump(threadType: "room" | "dm", threadId: string): void;
}

export const useUnreadStore = create<UnreadStore>((set, get) => ({
  counts: {},
  totalUnread: 0,
  async refresh(api: ApiClient) {
    try {
      const r = await api.getUnread();
      set({ counts: r.counts, totalUnread: r.totalUnread });
    } catch {
      /* */
    }
  },
  clearThread(threadType, threadId) {
    const key = `${threadType}:${threadId}`;
    const { counts, totalUnread } = get();
    const was = counts[key] ?? 0;
    if (was === 0) return;
    const next = { ...counts };
    delete next[key];
    set({ counts: next, totalUnread: Math.max(0, totalUnread - was) });
  },
  bump(threadType, threadId) {
    const key = `${threadType}:${threadId}`;
    const { counts, totalUnread } = get();
    set({
      counts: { ...counts, [key]: (counts[key] ?? 0) + 1 },
      totalUnread: totalUnread + 1,
    });
  },
}));
