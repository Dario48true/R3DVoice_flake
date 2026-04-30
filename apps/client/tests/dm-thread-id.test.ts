import { describe, it, expect } from "vitest";
import { dmThreadId, otherParticipantId } from "../src/renderer/src/lib/dm-thread-id";

describe("dm-thread-id", () => {
  it("dmThreadId returns lexically-sorted pair regardless of input order", () => {
    expect(dmThreadId("aaa", "bbb")).toBe("aaa:bbb");
    expect(dmThreadId("bbb", "aaa")).toBe("aaa:bbb");
  });

  it("otherParticipantId returns the half that isn't the caller", () => {
    expect(otherParticipantId("aaa:bbb", "aaa")).toBe("bbb");
    expect(otherParticipantId("aaa:bbb", "bbb")).toBe("aaa");
  });
});
