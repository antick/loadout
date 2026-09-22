import type { SHORTCUT_KEYS } from "@/lib/shortcuts";

/**
 * What the sidebar can show. Each has a button in the activity bar, which also opens the
 * section's main page.
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

/** The main page of each section: where its activity bar button leads. */
export const SECTION_PAGES = {
  home: "/",
  library: "/library",
  agents: "/agents",
  presets: "/presets",
  projects: "/projects",
  settings: "/settings",
} as const satisfies Record<SidebarSection, string>;

/** Whether this is a section's main page itself, not a page inside it or a detail opened on it. */
export function isSectionPage(section: SidebarSection, pathname: string, search: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return path === SECTION_PAGES[section] && !search;
}

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
