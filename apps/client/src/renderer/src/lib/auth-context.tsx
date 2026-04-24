import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import type { StoreApi } from "zustand/vanilla";
import { ApiClient } from "./api.js";
import { createAuthStore, type AuthState } from "./auth-store.js";
import { bridgeStorageAdapter } from "./bridge-adapter.js";

const Ctx = createContext<StoreApi<AuthState> | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): ReactElement {
  const store = useMemo(() => {
    const api = new ApiClient("http://localhost:3000");
    return createAuthStore(api, bridgeStorageAdapter);
  }, []);

  useEffect(() => {
    void store.getState().hydrate();
  }, [store]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useAuthStore<T>(selector: (s: AuthState) => T): T {
  const store = useContext(Ctx);
  if (!store) throw new Error("useAuthStore must be used inside AuthProvider");
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}
