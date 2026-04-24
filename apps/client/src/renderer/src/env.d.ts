import type { RedVoiceBridge } from "../../shared/bridge-types.js";

declare global {
  interface Window {
    redvoice: RedVoiceBridge;
  }
}

export {};
