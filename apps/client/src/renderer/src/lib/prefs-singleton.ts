import { useSyncExternalStore } from "react";
import { createPrefsStore, localStorageAdapter, type PrefsState } from "./prefs-store.js";

const prefsStore = createPrefsStore(localStorageAdapter);

export function usePrefs<T>(selector: (s: PrefsState) => T): T {
  return useSyncExternalStore(
    prefsStore.subscribe,
    () => selector(prefsStore.getState()),
    () => selector(prefsStore.getState()),
  );
}

/** Non-reactive access to the store's current state (for action calls outside render). */
export function prefsActions(): PrefsState {
  return prefsStore.getState();
}
