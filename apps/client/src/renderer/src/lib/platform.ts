export const IS_MAC =
  typeof navigator !== "undefined" && navigator.platform.startsWith("Mac");

export const MOD_KEY = IS_MAC ? "⌘" : "Ctrl";
export const SHIFT_KEY = IS_MAC ? "⇧" : "Shift";
export const ALT_KEY = IS_MAC ? "⌥" : "Alt";
