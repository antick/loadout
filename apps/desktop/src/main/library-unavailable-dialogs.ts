import { homedir } from "node:os";
import { join } from "node:path";
import { dialog } from "electron";
import { isLibraryDir, pointLibraryAt } from "@loadout/core";
import { LIBRARY_DIR_NAME } from "@loadout/shared";
import {
  UNAVAILABLE_TEXT,
  type UnavailableChoice,
  type UnavailablePrompts,
} from "./library-unavailable";

/** Button order of the prompt; the last one also answers Escape. */
const CHOICES: readonly UnavailableChoice[] = ["retry", "choose", "default", "quit"];

/** The "cannot find its library" prompts as native dialogs: they run before any window exists. */
export function nativeUnavailablePrompts(): UnavailablePrompts {
  const home = homedir();
  const defaultPath = join(home, LIBRARY_DIR_NAME);
  return {
    ask: (path) => {
      const index = dialog.showMessageBoxSync({
        type: "warning",
        title: UNAVAILABLE_TEXT.title,
        message: UNAVAILABLE_TEXT.message(path),
        detail: UNAVAILABLE_TEXT.detail,
        buttons: [
          UNAVAILABLE_TEXT.tryAgain,
          UNAVAILABLE_TEXT.choose,
          UNAVAILABLE_TEXT.useDefault,
          UNAVAILABLE_TEXT.quit,
        ],
        defaultId: 0,
        cancelId: CHOICES.length - 1,
        noLink: true,
      });
      return CHOICES[index] ?? "quit";
    },
    pickFolder: () =>
      dialog.showOpenDialogSync({
        title: UNAVAILABLE_TEXT.pickTitle,
        properties: ["openDirectory"],
      })?.[0] ?? null,
    isLibrary: isLibraryDir,
    tell: (message) =>
      void dialog.showMessageBoxSync({ type: "info", title: UNAVAILABLE_TEXT.title, message }),
    confirmDefault: (path) =>
      dialog.showMessageBoxSync({
        type: "question",
        title: UNAVAILABLE_TEXT.title,
        message: UNAVAILABLE_TEXT.confirmDefault(defaultPath, path),
        buttons: [UNAVAILABLE_TEXT.start, UNAVAILABLE_TEXT.back],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      }) === 0,
    point: (path) => pointLibraryAt(home, path),
  };
}
