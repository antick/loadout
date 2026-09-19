import { TEXT_SIZE_SCALE, type ThemeSetting } from "@skillboard/shared";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { useSetting } from "@/hooks/queries/settings";
import { applyLanguage } from "@/lib/i18n";

export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  /** The saved setting, which may be "system". */
  theme: ThemeSetting;
  /** What is actually on screen. */
  resolvedTheme: ResolvedTheme;
}

const DARK_CLASS = "dark";
const DARK_QUERY = "(prefers-color-scheme: dark)";
const TEXT_SCALE_VAR = "--app-text-scale";

const ThemeContext = createContext<ThemeContextValue>({ theme: "system", resolvedTheme: "light" });

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

/** Applies the appearance settings to the document: theme class, text scale and UI language. */
export function ThemeProvider({ children }: { children: ReactNode }): ReactNode {
  const theme = useSetting("theme");
  const textSize = useSetting("textSize");
  const language = useSetting("language");
  const systemDark = useSystemDark();
  const resolvedTheme: ResolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle(DARK_CLASS, resolvedTheme === "dark");
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      TEXT_SCALE_VAR,
      String(TEXT_SIZE_SCALE[textSize] ?? 1),
    );
  }, [textSize]);

  useEffect(() => applyLanguage(language), [language]);

  const value = useMemo(() => ({ theme, resolvedTheme }), [theme, resolvedTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** The theme setting and the theme currently shown. */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
