import { isAppError } from "@loadout/core";
import { APP_NAME } from "@loadout/shared";

export const UNAVAILABLE_TEXT = {
  title: `${APP_NAME} cannot find its library`,
  message: (path: string) => `The library is set to ${path}, but that folder is not there.`,
  detail:
    "If it is on an external or network disk, connect the disk and choose Try again. Nothing was changed, and no empty library is started in its place.",
  tryAgain: "Try again",
  choose: "Choose where it is now…",
  useDefault: "Use the default folder",
  quit: "Quit",
  pickTitle: "Choose the folder that holds the library",
  notALibrary: (path: string) => `${path} does not hold a ${APP_NAME} library.`,
  confirmDefault: (defaultPath: string, path: string) =>
    `Start with the library in ${defaultPath}? The library at ${path} is not changed or removed.`,
  start: "Start",
  back: "Back",
} as const;

/** What the user picked on the "cannot find its library" prompt. */
export type UnavailableChoice = "retry" | "choose" | "default" | "quit";

/** The prompts, injected so the flow runs without Electron in tests. */
export interface UnavailablePrompts {
  ask(path: string): UnavailableChoice;
  pickFolder(): string | null;
  isLibrary(path: string): boolean;
  tell(message: string): void;
  confirmDefault(path: string): boolean;
  /** Save the library location as `path` (null: the default folder), moving nothing. */
  point(path: string | null): void;
}

/**
 * Open the core; while the saved library cannot be found (a disk that is not connected), ask
 * the user what to do instead of starting an empty one. Null when they quit.
 */
export function openCoreOrAsk<T>(open: () => T, prompts: UnavailablePrompts): T | null {
  for (;;) {
    try {
      return open();
    } catch (error) {
      if (!isAppError(error, "LIBRARY_UNAVAILABLE")) throw error;
      const path = typeof error.details?.path === "string" ? error.details.path : "";
      const choice = prompts.ask(path);
      if (choice === "quit") return null;
      if (choice === "choose") {
        const picked = prompts.pickFolder();
        if (picked && prompts.isLibrary(picked)) prompts.point(picked);
        else if (picked) prompts.tell(UNAVAILABLE_TEXT.notALibrary(picked));
      }
      if (choice === "default" && prompts.confirmDefault(path)) prompts.point(null);
    }
  }
}
