import type { SHORTCUT_KEYS } from "@/lib/shortcuts";

/**
 * What the sidebar can show. Each has a button in the activity bar. Home and Settings are pages
 * as well as sections: their buttons open the page, and the sidebar follows.
 */
export const SIDEBAR_SECTIONS = [
  "home",
  "library",
  "agents",
  "presets",
  "projects",
  "settings",
] as const;
export type SidebarSection = (typeof SIDEBAR_SECTIONS)[number];
export const DEFAULT_SIDEBAR_SECTION: SidebarSection = "home";

/** Sections whose button opens a page; the others only switch the sidebar. */
export const SECTION_PAGES: Partial<Record<SidebarSection, "/" | "/settings">> = {
  home: "/",
  settings: "/settings",
};

export const SECTION_SHORTCUTS: Partial<Record<SidebarSection, keyof typeof SHORTCUT_KEYS>> = {
  home: "sectionHome",
  library: "sectionLibrary",
  agents: "sectionAgents",
  presets: "sectionPresets",
  projects: "sectionProjects",
  settings: "settings",
};

/** First path segment of the pages that belong to each section; "" is the home page. */
const SECTION_ROOTS: Record<string, SidebarSection> = {
  "": "home",
  library: "library",
  install: "library",
  agents: "agents",
  presets: "presets",
  projects: "projects",
  settings: "settings",
};

/** The section a page belongs to, or null for a page that keeps whatever is shown (backup). */
export function sectionForPath(pathname: string): SidebarSection | null {
  const first = pathname.split("/").find(Boolean) ?? "";
  return SECTION_ROOTS[first] ?? null;
}

export function isSidebarSection(value: unknown): value is SidebarSection {
  return SIDEBAR_SECTIONS.some((section) => section === value);
}
