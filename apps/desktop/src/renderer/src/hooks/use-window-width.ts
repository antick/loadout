import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

const read = (): number => window.innerWidth;

/** The window's width in pixels, updated as it is resized. */
export function useWindowWidth(): number {
  return useSyncExternalStore(subscribe, read);
}
