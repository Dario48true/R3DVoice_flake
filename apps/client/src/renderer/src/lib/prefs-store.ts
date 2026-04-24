import { createStore, type StoreApi } from "zustand/vanilla";

export interface PrefsStorage {
  read(): string | null;
  write(value: string): void;
}

export type Resolution = "720p" | "1080p" | "1440p" | "4K";
export type FrameRate = 30 | 60;

export interface PrefsState {
  micDeviceId: string | null;
  speakerDeviceId: string | null;
  resolution: Resolution;
  frameRate: FrameRate;
  shareAudio: boolean;
  pttKeybind: string | null;
  compatibilityMode: boolean;
  serverUrl: string;

  setMicDeviceId(id: string | null): void;
  setSpeakerDeviceId(id: string | null): void;
  setResolution(r: Resolution): void;
  setFrameRate(f: FrameRate): void;
  setShareAudio(v: boolean): void;
  setPttKeybind(k: string | null): void;
  setCompatibilityMode(v: boolean): void;
  setServerUrl(u: string): void;
}

const DEFAULTS = {
  micDeviceId: null as string | null,
  speakerDeviceId: null as string | null,
  resolution: "1080p" as Resolution,
  frameRate: 30 as FrameRate,
  shareAudio: true,
  pttKeybind: null as string | null,
  compatibilityMode: false,
  serverUrl: "http://localhost:3000",
};

function load(storage: PrefsStorage): typeof DEFAULTS {
  const raw = storage.read();
  if (!raw) return { ...DEFAULTS };
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function createPrefsStore(storage: PrefsStorage): StoreApi<PrefsState> {
  const initial = load(storage);

  function persistFromState(state: PrefsState): void {
    const payload = {
      micDeviceId: state.micDeviceId,
      speakerDeviceId: state.speakerDeviceId,
      resolution: state.resolution,
      frameRate: state.frameRate,
      shareAudio: state.shareAudio,
      pttKeybind: state.pttKeybind,
      compatibilityMode: state.compatibilityMode,
      serverUrl: state.serverUrl,
    };
    storage.write(JSON.stringify(payload));
  }

  return createStore<PrefsState>((set, get) => ({
    ...initial,
    setMicDeviceId: (v) => { set({ micDeviceId: v }); persistFromState(get()); },
    setSpeakerDeviceId: (v) => { set({ speakerDeviceId: v }); persistFromState(get()); },
    setResolution: (v) => { set({ resolution: v }); persistFromState(get()); },
    setFrameRate: (v) => { set({ frameRate: v }); persistFromState(get()); },
    setShareAudio: (v) => { set({ shareAudio: v }); persistFromState(get()); },
    setPttKeybind: (v) => { set({ pttKeybind: v }); persistFromState(get()); },
    setCompatibilityMode: (v) => { set({ compatibilityMode: v }); persistFromState(get()); },
    setServerUrl: (v) => { set({ serverUrl: v }); persistFromState(get()); },
  }));
}

export const localStorageAdapter: PrefsStorage = {
  read: () => globalThis.localStorage?.getItem("redvoice.prefs") ?? null,
  write: (v) => globalThis.localStorage?.setItem("redvoice.prefs", v),
};
