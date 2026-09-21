import type { PreloadBridge } from "@loadout/shared";

declare global {
  interface Window {
    loadout: PreloadBridge;
  }
}
