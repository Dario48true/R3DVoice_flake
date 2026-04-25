import { describe, it, expect } from "vitest";
import { dmThreadId, isDmParticipant, dmOtherParticipant } from "../src/chat/threads.js";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

describe("dmThreadId", () => {
  it("is order-independent", () => {
    expect(dmThreadId(A, B)).toBe(dmThreadId(B, A));
  });

  it("uses smaller-uuid:larger-uuid canonical form", () => {
    expect(dmThreadId(A, B)).toBe(`${A}:${B}`);
    expect(dmThreadId(B, A)).toBe(`${A}:${B}`);
  });

  it("rejects identical user-ids", () => {
    expect(() => dmThreadId(A, A)).toThrow();
  });

  it("rejects non-uuid inputs", () => {
    expect(() => dmThreadId("not-a-uuid", B)).toThrow();
    expect(() => dmThreadId(A, "")).toThrow();
  });
});

describe("isDmParticipant", () => {
  it("returns true for both participants", () => {
    const tid = dmThreadId(A, B);
    expect(isDmParticipant(tid, A)).toBe(true);
    expect(isDmParticipant(tid, B)).toBe(true);
  });

  it("returns false for an outsider", () => {
    const tid = dmThreadId(A, B);
    expect(isDmParticipant(tid, C)).toBe(false);
  });

  it("returns false for malformed thread-ids", () => {
    expect(isDmParticipant("not-a-thread", A)).toBe(false);
    expect(isDmParticipant("", A)).toBe(false);
  });
});

describe("dmOtherParticipant", () => {
  it("returns the partner", () => {
    const tid = dmThreadId(A, B);
    expect(dmOtherParticipant(tid, A)).toBe(B);
    expect(dmOtherParticipant(tid, B)).toBe(A);
  });

  it("returns null for an outsider", () => {
    const tid = dmThreadId(A, B);
    expect(dmOtherParticipant(tid, C)).toBeNull();
  });
});
