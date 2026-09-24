import {
  DEFAULT_SETTINGS,
  type PaletteSetting,
  TEXT_SIZE_SCALE,
  type ThemeSetting,
} from "@loadout/shared";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { useSetting, useSettings } from "@/hooks/queries/settings";
import { DARK_QUERY, applyAppearance, rememberAppearance } from "@/lib/appearance";
import { applyLanguage } from "@/lib/i18n";

export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  /** The saved setting, which may be "system". */
  theme: ThemeSetting;
  /** The colour palette. */
  palette: PaletteSetting;
  /** What is actually on screen. */
  resolvedTheme: ResolvedTheme;
}

const TEXT_SCALE_VAR = "--app-text-scale";

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  palette: DEFAULT_SETTINGS.palette,
  resolvedTheme: "light",
});

function useSystemDark(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia(DARK_QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent): void => setDark(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return dark;
}

/** Applies the appearance settings to the document: palette, mode, text scale and UI language. */
export function ThemeProvider({ children }: { children: ReactNode }): ReactNode {
  const theme = useSetting("theme");
  const palette = useSetting("palette");
  // Until settings load, the colours restored in main.tsx stay; defaults would flash otherwise.
  const loaded = useSettings().isSuccess;
  const textSize = useSetting("textSize");
  const language = useSetting("language");
  const systemDark = useSystemDark();
  const resolvedTheme: ResolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    if (!loaded) return;
    const appearance = { palette, dark: resolvedTheme === "dark" };
    applyAppearance(appearance);
    rememberAppearance(appearance);
  }, [loaded, palette, resolvedTheme]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      TEXT_SCALE_VAR,
      String(TEXT_SIZE_SCALE[textSize] ?? 1),
    );
  }, [textSize]);

  useEffect(() => applyLanguage(language), [language]);

  const value = useMemo(() => ({ theme, palette, resolvedTheme }), [theme, palette, resolvedTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** The theme setting and the theme currently shown. */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
