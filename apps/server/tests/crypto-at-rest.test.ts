import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { wrapAtRest, unwrapAtRest, isWrapped, __resetCryptoForTests } from "../src/crypto-at-rest.js";

describe("crypto-at-rest", () => {
  const ORIGINAL_KEY = process.env["MASTER_KEY"];

  beforeEach(() => {
    __resetCryptoForTests();
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env["MASTER_KEY"];
    else process.env["MASTER_KEY"] = ORIGINAL_KEY;
    __resetCryptoForTests();
  });

  describe("with MASTER_KEY set", () => {
    beforeEach(() => {
      process.env["MASTER_KEY"] = "test-master-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      __resetCryptoForTests();
    });

    it("wraps plaintext into a recognizable envelope", () => {
      const wrapped = wrapAtRest("hello world");
      expect(wrapped.startsWith("enc:v1:")).toBe(true);
      expect(isWrapped(wrapped)).toBe(true);
    });

    it("round-trips arbitrary UTF-8", () => {
      const samples = ["", "ascii", "🔥 emoji + ünïcødé", "x".repeat(4000)];
      for (const s of samples) {
        expect(unwrapAtRest(wrapAtRest(s))).toBe(s);
      }
    });

    it("produces a different ciphertext for the same plaintext (random IV)", () => {
      const a = wrapAtRest("hello");
      const b = wrapAtRest("hello");
      expect(a).not.toBe(b);
    });

    it("rejects tampered ciphertext via auth-tag verification", () => {
      const wrapped = wrapAtRest("secret");
      // Flip a byte in the base64 ciphertext segment — should fail auth.
      const idx = wrapped.length - 5;
      const tampered = wrapped.slice(0, idx) + (wrapped[idx] === "A" ? "B" : "A") + wrapped.slice(idx + 1);
      expect(() => unwrapAtRest(tampered)).toThrow();
    });

    it("returns legacy plaintext as-is", () => {
      expect(unwrapAtRest("not encrypted")).toBe("not encrypted");
      expect(isWrapped("not encrypted")).toBe(false);
    });
  });

  describe("without MASTER_KEY", () => {
    beforeEach(() => {
      delete process.env["MASTER_KEY"];
      __resetCryptoForTests();
    });

    it("wraps as a no-op (returns plaintext)", () => {
      expect(wrapAtRest("hello")).toBe("hello");
      expect(isWrapped("hello")).toBe(false);
    });

    it("throws if asked to unwrap an envelope without a key", () => {
      // First, wrap with a key so we have a valid envelope.
      process.env["MASTER_KEY"] = "test-master-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      __resetCryptoForTests();
      const wrapped = wrapAtRest("secret");
      // Then drop the key.
      delete process.env["MASTER_KEY"];
      __resetCryptoForTests();
      expect(() => unwrapAtRest(wrapped)).toThrow();
    });
  });

  describe("with a too-short MASTER_KEY", () => {
    beforeEach(() => {
      process.env["MASTER_KEY"] = "short";
      __resetCryptoForTests();
    });

    it("treats <32-char keys as missing (no encryption)", () => {
      expect(wrapAtRest("hello")).toBe("hello");
    });
  });
});
