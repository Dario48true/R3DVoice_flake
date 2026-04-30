import { describe, it, expect } from "vitest";
import type { WebSocket } from "ws";
import { sendToUser, markOnline, markOffline } from "../src/chat/ws-state";

describe("sendToUser", () => {
  it("sends to every socket of the named user", () => {
    const sent: string[] = [];
    const fakeSocket = { send: (s: string) => sent.push(s) } as unknown as WebSocket;
    const conn = { socket: fakeSocket, userId: "u1" };
    markOnline(conn);
    sendToUser("u1", { type: "ping" });
    expect(sent).toEqual([JSON.stringify({ type: "ping" })]);
    markOffline(conn);
  });

  it("no-ops when user is not online", () => {
    expect(() => sendToUser("nobody", { type: "x" })).not.toThrow();
  });
});
