import type { PreloadBridge } from "@skillboard/shared";

declare global {
  interface Window {
    skillboard: PreloadBridge;
  }
}
