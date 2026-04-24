import { describe, it, expect } from "vitest";
import { parseConfig } from "../src/config.js";

describe("parseConfig", () => {
  const valid = {
    DATABASE_URL: "file:./dev.db",
    JWT_SECRET: "x".repeat(32),
    LIVEKIT_URL: "ws://localhost:7880",
    LIVEKIT_API_KEY: "devkey",
    LIVEKIT_API_SECRET: "y".repeat(32),
  };

  it("parses valid env vars", () => {
    const cfg = parseConfig(valid);
    expect(cfg.JWT_SECRET).toBe(valid.JWT_SECRET);
    expect(cfg.LIVEKIT_URL).toBe(valid.LIVEKIT_URL);
  });

  it("throws when JWT_SECRET is too short", () => {
    expect(() => parseConfig({ ...valid, JWT_SECRET: "short" })).toThrow();
  });

  it("throws when a required var is missing", () => {
    const incomplete = { ...valid };
    // @ts-expect-error — removing a required key for the test
    delete incomplete.JWT_SECRET;
    expect(() => parseConfig(incomplete)).toThrow();
  });

  it("throws when LIVEKIT_API_SECRET is too short", () => {
    expect(() => parseConfig({ ...valid, LIVEKIT_API_SECRET: "short" })).toThrow();
  });
});
