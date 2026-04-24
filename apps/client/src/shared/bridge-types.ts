// Typed interface for the window.redvoice bridge exposed to the renderer.
// Kept in shared/ so both preload (exposes it) and renderer (consumes it) agree.

export interface RedVoiceBridge {
  /** Store a session token encrypted at rest via Electron safeStorage. */
  saveToken(token: string): Promise<void>;
  /** Retrieve the stored session token, or null if none/undecryptable. */
  getToken(): Promise<string | null>;
  /** Remove the stored session token. */
  clearToken(): Promise<void>;
  /** Platform string: "darwin" | "linux" | "win32". */
  platform(): string;
}
