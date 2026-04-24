import { globalShortcut } from "electron";

export type PttCallback = (pressed: boolean) => void;

let current: string | null = null;
let holdTimeout: NodeJS.Timeout | null = null;

export function setPttKeybind(accelerator: string | null, callback: PttCallback): void {
  if (current) {
    try { globalShortcut.unregister(current); } catch { /* noop */ }
  }
  current = accelerator;
  if (!accelerator) return;
  try {
    globalShortcut.register(accelerator, () => {
      callback(true);
      if (holdTimeout) clearTimeout(holdTimeout);
      holdTimeout = setTimeout(() => callback(false), 500);
    });
  } catch (err) {
    console.error("Failed to register PTT keybind:", accelerator, err);
    current = null;
  }
}

export function teardownKeybinds(): void {
  globalShortcut.unregisterAll();
  if (holdTimeout) clearTimeout(holdTimeout);
  holdTimeout = null;
  current = null;
}
