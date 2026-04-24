import { createStore, type StoreApi } from "zustand/vanilla";
import type { UserDTO } from "@redvoice/shared";
import { ApiClient, ApiError } from "./api.js";

export interface AuthStorageAdapter {
  saveToken(token: string): Promise<void>;
  getToken(): Promise<string | null>;
  clearToken(): Promise<void>;
}

type AuthStatus = "unauthenticated" | "loading" | "authenticated";

export interface AuthState {
  status: AuthStatus;
  user: UserDTO | null;
  token: string | null;
  serverUrl: string;
  error: string | null;

  login(email: string, password: string): Promise<void>;
  register(email: string, password: string, displayName: string): Promise<void>;
  logout(): Promise<void>;
  hydrate(): Promise<void>;
  setServerUrl(url: string): void;
}

const DEFAULT_SERVER_URL = "http://localhost:3000";

export function createAuthStore(
  api: ApiClient,
  storage: AuthStorageAdapter,
): StoreApi<AuthState> {
  return createStore<AuthState>((set, get) => ({
    status: "unauthenticated",
    user: null,
    token: null,
    serverUrl: DEFAULT_SERVER_URL,
    error: null,

    async login(email, password) {
      set({ status: "loading", error: null });
      try {
        const { token, user } = await api.login({ email, password });
        api.setToken(token);
        await storage.saveToken(token);
        set({ status: "authenticated", token, user, error: null });
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "login failed";
        set({ status: "unauthenticated", error: message });
      }
    },

    async register(email, password, displayName) {
      set({ status: "loading", error: null });
      try {
        const { token, user } = await api.register({ email, password, displayName });
        api.setToken(token);
        await storage.saveToken(token);
        set({ status: "authenticated", token, user, error: null });
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "register failed";
        set({ status: "unauthenticated", error: message });
      }
    },

    async logout() {
      const { token } = get();
      if (token) {
        try {
          await api.logout();
        } catch {
          // Best effort — clear client state regardless of server response
        }
      }
      api.setToken(null);
      await storage.clearToken();
      set({ status: "unauthenticated", token: null, user: null, error: null });
    },

    async hydrate() {
      const persisted = await storage.getToken();
      if (!persisted) {
        set({ status: "unauthenticated" });
        return;
      }
      set({ status: "loading", token: persisted });
      api.setToken(persisted);
      try {
        const user = await api.me();
        set({ status: "authenticated", user, error: null });
      } catch {
        api.setToken(null);
        await storage.clearToken();
        set({ status: "unauthenticated", token: null, user: null });
      }
    },

    setServerUrl(url) {
      const clean = url.replace(/\/$/, "");
      api.setBaseUrl(clean);
      set({ serverUrl: clean });
    },
  }));
}
