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
}
