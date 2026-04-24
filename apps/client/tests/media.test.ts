import { describe, it, expect, vi } from "vitest";
import { listAudioInputs, listAudioOutputs } from "../src/renderer/src/lib/media.js";

function makeDevices(kind: "audioinput" | "audiooutput", entries: Array<{ id: string; label: string }>) {
  return entries.map((e) => ({
    deviceId: e.id,
    kind,
    label: e.label,
    groupId: "",
    toJSON: () => ({}),
  }));
}

function stubNavigator(value: { mediaDevices: unknown }) {
  Object.defineProperty(globalThis, "navigator", {
    value,
    configurable: true,
    writable: true,
  });
}

describe("media device helpers", () => {
  it("listAudioInputs returns only audio inputs", async () => {
    const enumerate = vi.fn().mockResolvedValue([
      ...makeDevices("audioinput", [
        { id: "mic-a", label: "Built-in mic" },
        { id: "mic-b", label: "USB mic" },
      ]),
      ...makeDevices("audiooutput", [{ id: "spk-a", label: "Built-in speakers" }]),
    ]);
    stubNavigator({ mediaDevices: { enumerateDevices: enumerate } });

    const inputs = await listAudioInputs();
    expect(inputs).toEqual([
      { deviceId: "mic-a", label: "Built-in mic" },
      { deviceId: "mic-b", label: "USB mic" },
    ]);
  });

  it("listAudioOutputs returns only audio outputs", async () => {
    const enumerate = vi.fn().mockResolvedValue([
      ...makeDevices("audioinput", [{ id: "mic-a", label: "Built-in mic" }]),
      ...makeDevices("audiooutput", [{ id: "spk-a", label: "Built-in speakers" }]),
    ]);
    stubNavigator({ mediaDevices: { enumerateDevices: enumerate } });

    const outputs = await listAudioOutputs();
    expect(outputs).toEqual([{ deviceId: "spk-a", label: "Built-in speakers" }]);
  });

  it("lists return an empty array when the API is missing", async () => {
    stubNavigator({ mediaDevices: undefined });
    expect(await listAudioInputs()).toEqual([]);
    expect(await listAudioOutputs()).toEqual([]);
  });
});
