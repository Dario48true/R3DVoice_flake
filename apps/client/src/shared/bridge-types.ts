// Typed interface for the window.redvoice bridge exposed to the renderer.
// Kept in shared/ so both preload (exposes it) and renderer (consumes it) agree.

export type SplashPhase =
  | "initializing"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "loading"
  | "ready"
  | "error";

export interface SplashStatus {
  phase: SplashPhase;
  /** Download progress percent (0..100) when phase is "downloading". */
  percent?: number;
  /** Optional human-readable message; overrides the default per-phase label. */
  message?: string;
}

export type MediaPermissionKind = "microphone" | "camera" | "screen";
export type MediaPermissionStatus = "not-determined" | "granted" | "denied" | "restricted" | "unknown";

export interface RedVoiceBridge {
  /** Store a session token encrypted at rest via Electron safeStorage. */
  saveToken(token: string): Promise<void>;
  /** Retrieve the stored session token, or null if none/undecryptable. */
  getToken(): Promise<string | null>;
  /** Remove the stored session token. */
  clearToken(): Promise<void>;
  /** Platform string: "darwin" | "linux" | "win32". */
  platform(): string;
  listScreenSources(): Promise<Array<{ id: string; name: string; thumbnailDataUrl: string }>>;
  selectScreenSource(sourceId: string): Promise<void>;
  cancelScreenPicker(): Promise<void>;
  setPttKeybind(accelerator: string | null): Promise<void>;
  onPttEvent(cb: (pressed: boolean) => void): () => void;
  setCompatibilityEnv(enabled: boolean): Promise<void>;
  relaunch(): Promise<void>;
  /**
   * Subscribe to splash-window status updates from the main process.
   * Used by the splash renderer; harmless to call from the main window.
   * Returns an unsubscribe function.
   */
  onSplashStatus(cb: (status: SplashStatus) => void): () => void;
  /**
   * Subscribe to deep-link events from the OS (redvoice://…).
   * Returns an unsubscribe function.
   */
  onDeepLink(cb: (link: DeepLinkEvent) => void): () => void;
  /** macOS media permission status. On non-mac platforms returns "granted". */
  getMediaPermission(kind: MediaPermissionKind): Promise<MediaPermissionStatus>;
  /** macOS mic/camera permission prompt. No-op on non-mac; screen is not promptable. */
  askMediaPermission(kind: "microphone" | "camera"): Promise<boolean>;
  /** macOS: open System Settings → Privacy → Screen Recording. No-op elsewhere. */
  openMacScreenSettings(): Promise<void>;
  /** Open an http(s) URL in the default browser. Other schemes are rejected. */
  openExternal(url: string): Promise<void>;
  /** Toggle opt-in crash reporting (takes effect on next launch). */
  setCrashReporting(enabled: boolean): Promise<void>;
  /** Open the OS file manager at the local crash-dump directory. */
  openCrashDumps(): Promise<void>;
  /**
   * Start the native system-audio capture helper (Windows-only). Resolves to
   * "started" when the helper is producing PCM, or "unsupported" if the
   * binary isn't bundled / OS build doesn't support PROCESS_LOOPBACK_MODE /
   * activation failed. Use `onSystemAudioChunk` to receive PCM frames.
   */
  startSystemAudioCapture(): Promise<"started" | "unsupported">;
  /** Stop a running system-audio capture session. No-op if none. */
  stopSystemAudioCapture(): Promise<void>;
  /** PCM format the helper emits — needed to reconstruct a MediaStream. */
  systemAudioFormat(): Promise<SystemAudioFormat>;
  /** Subscribe to PCM chunks from the helper. Returns an unsubscribe. */
  onSystemAudioChunk(cb: (chunk: Uint8Array) => void): () => void;
  /** Notified once when the helper exits (helper crashed or was stopped). */
  onSystemAudioEnded(cb: () => void): () => void;
  /**
   * Linux-only: set up routing so screenshare audio capture excludes
   * RedVoice's own playback. Returns the monitor source description to find
   * via enumerateDevices(), or null if PulseAudio is unavailable / setup
   * failed. Idempotent.
   */
  enableLinuxAudioRouting(): Promise<{ monitorDeviceDescription: string } | null>;
  /** Tear down the routing set up by enableLinuxAudioRouting. */
  disableLinuxAudioRouting(): Promise<void>;
}

export interface SystemAudioFormat {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

export type DeepLinkEvent = { type: "join-room"; roomId: string };
