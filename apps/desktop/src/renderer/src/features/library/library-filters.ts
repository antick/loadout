import {
  SOURCE_TYPES,
  hasSkillErrors,
  matchesSkillQuery,
  type Skill,
  type SourceType,
  type UpdateStatus,
} from "@loadout/shared";
import { matchesTagFilter } from "@/lib/tag-filter";

export const FILTER_ALL = "all";

export const SOURCE_FILTERS = [FILTER_ALL, ...SOURCE_TYPES] as const;
export type SourceFilter = typeof FILTER_ALL | SourceType;

export const STATUS_FILTERS = [
  FILTER_ALL,
  "deployed",
  "not_deployed",
  "updates",
  "attention",
] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const SORT_MODES = ["name", "updated", "added"] as const;
export type SortMode = (typeof SORT_MODES)[number];
export const DEFAULT_SORT_MODE: SortMode = "name";

export interface LibraryFilters {
  query: string;
  source: SourceFilter;
  status: StatusFilter;
  tags: readonly string[];
  sort: SortMode;
}

export const EMPTY_FILTERS: Omit<LibraryFilters, "sort"> = {
  query: "",
  source: FILTER_ALL,
  status: FILTER_ALL,
  tags: [],
};

/** Update states the user has to look at: the check failed or the source is gone. */
const ATTENTION_STATUSES: ReadonlySet<UpdateStatus> = new Set(["error", "source_missing"]);

export function hasUpdate(skill: Skill): boolean {
  return skill.updateStatus === "update_available";
}

/** Something the user has to fix: a failed check, a backup conflict, or a broken SKILL.md. */
export function needsAttention(skill: Skill): boolean {
  return (
    skill.hasConflict || ATTENTION_STATUSES.has(skill.updateStatus) || hasSkillErrors(skill.issues)
  );
}

function matchesStatus(skill: Skill, status: StatusFilter): boolean {
  switch (status) {
    case "deployed":
      return skill.deployments.length > 0;
    case "not_deployed":
      return skill.deployments.length === 0;
    case "updates":
      return hasUpdate(skill);
    case "attention":
      return needsAttention(skill);
    default:
      return true;
  }
}

const COMPARATORS: Record<SortMode, (a: Skill, b: Skill) => number> = {
  name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  updated: (a, b) => b.updatedAt - a.updatedAt,
  added: (a, b) => b.createdAt - a.createdAt,
};

export function isFiltering(filters: LibraryFilters): boolean {
  return (
    filters.query.trim() !== "" ||
    filters.source !== FILTER_ALL ||
    filters.status !== FILTER_ALL ||
    filters.tags.length > 0
  );
}

/** Search (name, description, tags, source), then source, status and tag filters, then sort. */
export function filterSkills(skills: readonly Skill[], filters: LibraryFilters): Skill[] {
  const byName = COMPARATORS.name;
  const compare = COMPARATORS[filters.sort];
  return skills
    .filter(
      (skill) =>
        matchesSkillQuery(skill, filters.query) &&
        (filters.source === FILTER_ALL || skill.sourceType === filters.source) &&
        matchesStatus(skill, filters.status) &&
        matchesTagFilter(skill.tags, filters.tags),
    )
    .sort((a, b) => compare(a, b) || byName(a, b));
}
