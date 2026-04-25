import { createStore, type StoreApi } from "zustand/vanilla";

export interface PrefsStorage {
  read(): string | null;
  write(value: string): void;
}

export type Resolution = "720p" | "1080p" | "1440p" | "4K";
export type FrameRate = 30 | 60;
export type NoiseSuppressionLevel = "off" | "low" | "high";

export interface PrefsState {
  micDeviceId: string | null;
  speakerDeviceId: string | null;
  resolution: Resolution;
  frameRate: FrameRate;
  shareAudio: boolean;
  pttKeybind: string | null;
  muteKeybind: string | null;
  deafenKeybind: string | null;
  shareScreenKeybind: string | null;
  openSettingsKeybind: string | null;
  leaveRoomKeybind: string | null;
  compatibilityMode: boolean;
  crashReporting: boolean;
  noiseSuppression: NoiseSuppressionLevel;
  echoCancellation: boolean;
  autoGainControl: boolean;
  micGain: number;
  serverUrl: string;

  setMicDeviceId(id: string | null): void;
  setSpeakerDeviceId(id: string | null): void;
  setResolution(r: Resolution): void;
  setFrameRate(f: FrameRate): void;
  setShareAudio(v: boolean): void;
  setPttKeybind(k: string | null): void;
  setMuteKeybind(k: string | null): void;
  setDeafenKeybind(k: string | null): void;
  setShareScreenKeybind(k: string | null): void;
  setOpenSettingsKeybind(k: string | null): void;
  setLeaveRoomKeybind(k: string | null): void;
  setCompatibilityMode(v: boolean): void;
  setCrashReporting(v: boolean): void;
  setNoiseSuppression(v: NoiseSuppressionLevel): void;
  setEchoCancellation(v: boolean): void;
  setAutoGainControl(v: boolean): void;
  setMicGain(v: number): void;
  setServerUrl(u: string): void;
}

const DEFAULTS = {
  micDeviceId: null as string | null,
  speakerDeviceId: null as string | null,
  resolution: "1080p" as Resolution,
  frameRate: 30 as FrameRate,
  shareAudio: true,
  pttKeybind: null as string | null,
  muteKeybind: null as string | null,
  deafenKeybind: null as string | null,
  shareScreenKeybind: null as string | null,
  openSettingsKeybind: null as string | null,
  leaveRoomKeybind: null as string | null,
  compatibilityMode: false,
  crashReporting: false,
  noiseSuppression: "low" as NoiseSuppressionLevel,
  echoCancellation: true,
  autoGainControl: true,
  micGain: 1.0,
  serverUrl: "https://voice.r3dwolfie.com",
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
      muteKeybind: state.muteKeybind,
      deafenKeybind: state.deafenKeybind,
      shareScreenKeybind: state.shareScreenKeybind,
      openSettingsKeybind: state.openSettingsKeybind,
      leaveRoomKeybind: state.leaveRoomKeybind,
      compatibilityMode: state.compatibilityMode,
      crashReporting: state.crashReporting,
      noiseSuppression: state.noiseSuppression,
      echoCancellation: state.echoCancellation,
      autoGainControl: state.autoGainControl,
      micGain: state.micGain,
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
    setMuteKeybind: (v) => { set({ muteKeybind: v }); persistFromState(get()); },
    setDeafenKeybind: (v) => { set({ deafenKeybind: v }); persistFromState(get()); },
    setShareScreenKeybind: (v) => { set({ shareScreenKeybind: v }); persistFromState(get()); },
    setOpenSettingsKeybind: (v) => { set({ openSettingsKeybind: v }); persistFromState(get()); },
    setLeaveRoomKeybind: (v) => { set({ leaveRoomKeybind: v }); persistFromState(get()); },
    setCompatibilityMode: (v) => { set({ compatibilityMode: v }); persistFromState(get()); },
    setCrashReporting: (v) => { set({ crashReporting: v }); persistFromState(get()); },
    setNoiseSuppression: (v) => { set({ noiseSuppression: v }); persistFromState(get()); },
    setEchoCancellation: (v) => { set({ echoCancellation: v }); persistFromState(get()); },
    setAutoGainControl: (v) => { set({ autoGainControl: v }); persistFromState(get()); },
    setMicGain: (v) => { set({ micGain: v }); persistFromState(get()); },
    setServerUrl: (v) => { set({ serverUrl: v }); persistFromState(get()); },
  }));
}

export const localStorageAdapter: PrefsStorage = {
  read: () => globalThis.localStorage?.getItem("redvoice.prefs") ?? null,
  write: (v) => globalThis.localStorage?.setItem("redvoice.prefs", v),
};
