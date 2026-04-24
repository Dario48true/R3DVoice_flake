import type { AuthStorageAdapter } from "./auth-store.js";

/** Bridges window.redvoice (exposed by preload) to AuthStorageAdapter. */
export const bridgeStorageAdapter: AuthStorageAdapter = {
  saveToken: (t) => window.redvoice.saveToken(t),
  getToken: () => window.redvoice.getToken(),
  clearToken: () => window.redvoice.clearToken(),
};
