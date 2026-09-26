import type { Project } from "@loadout/shared";

/** How many recently used projects the sidebar lists above the full list. */
export const FREQUENT_PROJECT_COUNT = 3;
/** With this many projects or fewer the whole list fits, and Frequent would only repeat it. */
export const FREQUENT_MIN_PROJECTS = 6;

/** Pinned projects, in the user's project order. */
export function pinnedProjects(projects: readonly Project[]): Project[] {
  return projects.filter((project) => project.pinned);
}

/**
 * The most opened projects of the last 30 days that are not pinned already, most opened first,
 * the latest opened first on a tie. Empty while the list is short enough to see at once.
 */
export function frequentProjects(projects: readonly Project[]): Project[] {
  if (projects.length <= FREQUENT_MIN_PROJECTS) return [];
  return projects
    .filter((project) => !project.pinned && project.recentOpens > 0)
    .sort((a, b) => b.recentOpens - a.recentOpens || (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
    .slice(0, FREQUENT_PROJECT_COUNT);
}
