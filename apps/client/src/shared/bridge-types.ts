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
}

export type DeepLinkEvent = { type: "join-room"; roomId: string };
