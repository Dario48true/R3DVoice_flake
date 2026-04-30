import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildApp } from "./helpers/app";
import { resetDb, registerUser, authHeader, setHandle, createRoom } from "./helpers/fixtures";
import * as wsState from "../src/chat/ws-state";

describe("WS event emission", () => {
  beforeEach(() => resetDb());

  it("posting a message with @handle fires chat.mention to the mentioned user", async () => {
    const spy = vi.spyOn(wsState, "sendToUser").mockImplementation(() => {});
    const app = await buildApp();
    const owner = await registerUser(app, { email: "o@x.com" });
    const member = await registerUser(app, { email: "m@x.com" });
    await setHandle(app, owner.token, "owner");
    await setHandle(app, member.token, "bob");
    const room = await createRoom(app, owner.token, "studio");
    await app.inject({
      method: "POST", url: `/rooms/${room.id}/members`, headers: authHeader(owner.token),
      payload: { userId: member.id },
    });
    await app.inject({
      method: "POST", url: "/chat/messages", headers: authHeader(owner.token),
      payload: { threadType: "room", threadId: room.id, body: "hey @bob" },
    });

    const mentionCall = spy.mock.calls.find((c) => {
      const payload = c[1] as { type?: string };
      return payload.type === "chat.mention";
    });
    expect(mentionCall).toBeDefined();
    expect(mentionCall![0]).toBe(member.id);
    spy.mockRestore();
  });
});
