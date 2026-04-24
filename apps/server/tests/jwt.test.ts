import { describe, it, expect } from "vitest";
import { signSessionToken, verifySessionToken } from "../src/auth/jwt.js";

const secret = "z".repeat(40);

describe("session JWT", () => {
  it("signs and verifies a token", () => {
    const token = signSessionToken({ userId: "u1", sessionId: "s1" }, secret);
    const payload = verifySessionToken(token, secret);
    expect(payload.userId).toBe("u1");
    expect(payload.sessionId).toBe("s1");
  });

  it("rejects a token signed with a different secret", () => {
    const token = signSessionToken({ userId: "u1", sessionId: "s1" }, secret);
    expect(() => verifySessionToken(token, "w".repeat(40))).toThrow();
  });

  it("rejects a malformed token", () => {
    expect(() => verifySessionToken("nope", secret)).toThrow();
  });

  it("embeds a 30-day exp by default", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signSessionToken({ userId: "u1", sessionId: "s1" }, secret);
    const payload = verifySessionToken(token, secret);
    const thirtyDays = 30 * 24 * 60 * 60;
    expect(payload.exp).toBeGreaterThan(now + thirtyDays - 60);
    expect(payload.exp).toBeLessThan(now + thirtyDays + 60);
  });
});
