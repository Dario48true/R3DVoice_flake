import { describe, it, expect, beforeEach } from "vitest";
import { useUnreadStore } from "../src/renderer/src/lib/unread-store";

describe("unread-store", () => {
  beforeEach(() => {
    useUnreadStore.setState({ counts: {}, totalUnread: 0 });
  });

  it("bump increments a thread count", () => {
    useUnreadStore.getState().bump("dm", "a:b");
    expect(useUnreadStore.getState().counts["dm:a:b"]).toBe(1);
    expect(useUnreadStore.getState().totalUnread).toBe(1);
  });

  it("clearThread zeros out a thread and reduces total", () => {
    useUnreadStore.setState({ counts: { "dm:a:b": 3, "dm:c:d": 2 }, totalUnread: 5 });
    useUnreadStore.getState().clearThread("dm", "a:b");
    expect(useUnreadStore.getState().counts["dm:a:b"]).toBeUndefined();
    expect(useUnreadStore.getState().totalUnread).toBe(2);
  });

  it("clearThread on already-zero thread is a no-op", () => {
    useUnreadStore.getState().clearThread("dm", "missing");
    expect(useUnreadStore.getState().totalUnread).toBe(0);
  });
});
