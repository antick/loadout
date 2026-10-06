import type { MessageBoxOptions } from "electron";
import { APP_NAME, type CloseActionSetting } from "@loadout/shared";

/** What the close button does: let the window close (and the app quit), hide it, or ask. */
export type CloseOutcome = "close" | "hide" | "ask";

export interface CloseInputs {
  trayVisible: boolean;
  closeAction: CloseActionSetting;
}

/** Without a tray icon there is nothing to hide to, so the window closes. */
export function closeOutcome({ trayVisible, closeAction }: CloseInputs): CloseOutcome {
  if (!trayVisible || closeAction === "quit") return "close";
  return closeAction === "hide" ? "hide" : "ask";
}

/** The answers of the close question, in the order of its buttons; the last one is Cancel. */
const CLOSE_CHOICES = ["hide", "quit"] as const;
export type CloseChoice = (typeof CLOSE_CHOICES)[number];

/**
 * "Close or keep in the tray?" as a native dialog of the window: it needs nothing from the page,
 * so a page that failed to load or hangs never leaves the close button without an answer.
 */
export const CLOSE_QUESTION: MessageBoxOptions = {
  type: "question",
  message: `Close ${APP_NAME}?`,
  detail:
    "Keep it in the tray to continue automatic backups and update checks, or quit completely.",
  buttons: ["Keep in tray", "Quit", "Cancel"],
  defaultId: 0,
  cancelId: CLOSE_CHOICES.length,
  checkboxLabel: "Remember my choice",
  noLink: true,
};

/** The choice behind the button pressed; null for Cancel (the window stays). */
export function closeChoice(response: number): CloseChoice | null {
  return CLOSE_CHOICES[response] ?? null;
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
