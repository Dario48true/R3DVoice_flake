import { describe, it, expect } from "vitest";
import { generateInviteCode } from "../src/invites/code";

describe("invite code generator", () => {
  it("generates 8 characters", () => {
    expect(generateInviteCode()).toHaveLength(8);
  });

  it("only uses unambiguous alphabet", () => {
    const SAFE = /^[ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789]+$/;
    for (let i = 0; i < 1000; i++) {
      expect(generateInviteCode()).toMatch(SAFE);
    }
  });

  it("does not produce 0/O/1/l/I", () => {
    for (let i = 0; i < 500; i++) {
      const c = generateInviteCode();
      expect(c).not.toMatch(/[0OoIl1]/);
    }
  });
});
