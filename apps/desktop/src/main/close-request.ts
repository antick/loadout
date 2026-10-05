import type { CloseActionSetting } from "@loadout/shared";

/** What the close button does: let the window close (and the app quit), hide it, or ask. */
export type CloseOutcome = "close" | "hide" | "ask";

export interface CloseInputs {
  trayVisible: boolean;
  closeAction: CloseActionSetting;
  /** The page's process runs, so it can show the question. */
  rendererAlive: boolean;
}

/**
 * Without a tray icon there is nothing to hide to, so the window closes. Asking needs a page to
 * ask on: when it is gone, the window hides, as if the person had chosen the tray.
 */
export function closeOutcome({
  trayVisible,
  closeAction,
  rendererAlive,
}: CloseInputs): CloseOutcome {
  if (!trayVisible || closeAction === "quit") return "close";
  if (closeAction === "hide") return "hide";
  return rendererAlive ? "ask" : "hide";
}

export interface CloseRequestDeps {
  /** Send `window:close-requested` to the page. */
  send(): void;
  /** The page did not take the question in time: close without asking. */
  fallback(): void;
  timeoutMs: number;
}

export interface CloseRequests {
  /** Ask the page; falls back when it does not acknowledge within the timeout. */
  ask(): void;
  /** The page will ask. False when it came too late and the fallback already ran. */
  acknowledge(): boolean;
  /** Forget a question in flight (the window went away). */
  cancel(): void;
}

/**
 * The question is the page's to show, but the close button must never depend on it: a page that
 * failed to render, hangs or never loaded leaves the main process to decide on its own.
 */
export function createCloseRequests(deps: CloseRequestDeps): CloseRequests {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return {
    ask: () => {
      // Pressing the button again does not give a stuck page more time.
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        deps.fallback();
      }, deps.timeoutMs);
      deps.send();
    },
    acknowledge: () => {
      if (!timer) return false;
      cancel();
      return true;
    },
    cancel,
  };
}

/**
 * After the page's process died, load it again, unless it died right after the last reload: a
 * page that crashes on load would otherwise reload forever.
 */
export function shouldReloadPage(
  reason: string,
  lastReloadAt: number | null,
  now: number,
  minIntervalMs: number,
): boolean {
  if (reason === "clean-exit") return false;
  return lastReloadAt === null || now - lastReloadAt >= minIntervalMs;
}
