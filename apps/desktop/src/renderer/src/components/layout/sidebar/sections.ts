import type { SHORTCUT_KEYS } from "@/lib/shortcuts";

/**
 * What the collapsible sidebar can show. Each has a button in the icon rail; the rail's other
 * buttons (home, backup, settings) go straight to a page instead.
 */
export const SIDEBAR_SECTIONS = ["library", "agents", "presets", "projects"] as const;
export type SidebarSection = (typeof SIDEBAR_SECTIONS)[number];
export const DEFAULT_SIDEBAR_SECTION: SidebarSection = "library";

export const SECTION_SHORTCUTS: Record<SidebarSection, keyof typeof SHORTCUT_KEYS> = {
  library: "sectionLibrary",
  agents: "sectionAgents",
  presets: "sectionPresets",
  projects: "sectionProjects",
};

/** First path segment of the pages that belong to each section. */
const SECTION_ROOTS: Record<string, SidebarSection> = {
  library: "library",
  install: "library",
  agents: "agents",
  presets: "presets",
  projects: "projects",
};

/** The section a page belongs to, or null for pages of their own (home, backup, settings). */
export function sectionForPath(pathname: string): SidebarSection | null {
  const first = pathname.split("/").find(Boolean) ?? "";
  return SECTION_ROOTS[first] ?? null;
}

export function isSidebarSection(value: unknown): value is SidebarSection {
  return SIDEBAR_SECTIONS.some((section) => section === value);
}
