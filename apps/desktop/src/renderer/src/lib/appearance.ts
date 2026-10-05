import {
  DEFAULT_SETTINGS,
  PALETTES,
  type PaletteSetting,
  TEXT_SIZE_SCALE,
  TEXT_SIZES,
  type TextSizeSetting,
} from "@loadout/shared";
import { APPEARANCE_STORAGE_KEY } from "@/lib/constants";

/** What the window looks like: which palette, whether it is in dark mode, and the text size. */
export interface Appearance {
  palette: PaletteSetting;
  dark: boolean;
  textSize: TextSizeSetting;
}

const DARK_CLASS = "dark";
const DARK_QUERY = "(prefers-color-scheme: dark)";
const TEXT_SCALE_VAR = "--app-text-scale";

export function isPalette(value: unknown): value is PaletteSetting {
  return PALETTES.some((palette) => palette === value);
}

function isTextSize(value: unknown): value is TextSizeSetting {
  return TEXT_SIZES.some((size) => size === value);
}

/** Put the palette (`data-theme`), the mode (`dark` class) and the text scale on the document. */
export function applyAppearance(
  appearance: Appearance,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.theme = appearance.palette;
  root.classList.toggle(DARK_CLASS, appearance.dark);
  root.style.colorScheme = appearance.dark ? "dark" : "light";
  root.style.setProperty(TEXT_SCALE_VAR, String(TEXT_SIZE_SCALE[appearance.textSize] ?? 1));
}

/**
 * Keep a copy in local storage. The settings themselves arrive over IPC a moment after the
 * window opens; this copy lets the first paint already show the right colours.
 */
export function rememberAppearance(
  appearance: Appearance,
  storage: Storage = window.localStorage,
): void {
  try {
    storage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
  } catch {
    // Without storage the window starts in the default palette and switches once settings load.
  }
}

/** The copy from the last run, or the defaults (following the system's light or dark). */
export function restoreAppearance(storage: Storage = window.localStorage): Appearance {
  const fallback: Appearance = {
    palette: DEFAULT_SETTINGS.palette,
    dark: typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches,
    textSize: DEFAULT_SETTINGS.textSize,
  };
  try {
    const raw = storage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as Partial<Appearance>;
    return {
      palette: isPalette(saved.palette) ? saved.palette : fallback.palette,
      dark: typeof saved.dark === "boolean" ? saved.dark : fallback.dark,
      textSize: isTextSize(saved.textSize) ? saved.textSize : fallback.textSize,
    };
  } catch {
    return fallback;
  }
}

export { DARK_QUERY };
