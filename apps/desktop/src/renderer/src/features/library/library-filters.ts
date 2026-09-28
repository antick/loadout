import {
  SOURCE_TYPES,
  type Skill,
  type SkillUsage,
  type SourceType,
  type UpdateStatus,
  hasSkillErrors,
  isUnusedSkill,
  matchesSkillQuery,
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
  "unused",
] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const SORT_MODES = ["name", "updated", "added", "last_used", "most_used"] as const;
export type SortMode = (typeof SORT_MODES)[number];
export const DEFAULT_SORT_MODE: SortMode = "name";

/** Filters and sorts that need usage tracking on; offered only then. */
const USAGE_STATUS_FILTERS: ReadonlySet<StatusFilter> = new Set(["unused"]);
const USAGE_SORT_MODES: ReadonlySet<SortMode> = new Set(["last_used", "most_used"]);

export const needsUsage = (value: StatusFilter | SortMode): boolean =>
  USAGE_STATUS_FILTERS.has(value as StatusFilter) || USAGE_SORT_MODES.has(value as SortMode);

/** Usage of each skill by id, and whether tracking is on (without it, usage filters do nothing). */
export interface UsageLookup {
  enabled: boolean;
  byId: ReadonlyMap<string, SkillUsage>;
}

export const NO_USAGE: UsageLookup = { enabled: false, byId: new Map() };

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

function matchesStatus(skill: Skill, status: StatusFilter, usage: UsageLookup): boolean {
  switch (status) {
    case "unused":
      return !usage.enabled || isUnusedSkill(skill, usage.byId);
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

type Comparator = (a: Skill, b: Skill) => number;

const byName: Comparator = (a, b) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

function comparator(sort: SortMode, usage: UsageLookup): Comparator {
  const used = (skill: Skill): SkillUsage | undefined => usage.byId.get(skill.id);
  switch (sort) {
    case "updated":
      return (a, b) => b.updatedAt - a.updatedAt;
    case "added":
      return (a, b) => b.createdAt - a.createdAt;
    // Without tracking there is nothing to sort by: fall back to names.
    case "last_used":
      return usage.enabled
        ? (a, b) => (used(b)?.lastUsedAt ?? 0) - (used(a)?.lastUsedAt ?? 0)
        : byName;
    case "most_used":
      return usage.enabled
        ? (a, b) =>
            (used(b)?.recentUses ?? 0) - (used(a)?.recentUses ?? 0) ||
            (used(b)?.uses ?? 0) - (used(a)?.uses ?? 0)
        : byName;
    default:
      return byName;
  }
}

export function isFiltering(filters: LibraryFilters): boolean {
  return (
    filters.query.trim() !== "" ||
    filters.source !== FILTER_ALL ||
    filters.status !== FILTER_ALL ||
    filters.tags.length > 0
  );
}

/** Search (name, description, tags, source), then source, status and tag filters, then sort. */
export function filterSkills(
  skills: readonly Skill[],
  filters: LibraryFilters,
  usage: UsageLookup = NO_USAGE,
): Skill[] {
  const compare = comparator(filters.sort, usage);
  return skills
    .filter(
      (skill) =>
        matchesSkillQuery(skill, filters.query) &&
        (filters.source === FILTER_ALL || skill.sourceType === filters.source) &&
        matchesStatus(skill, filters.status, usage) &&
        matchesTagFilter(skill.tags, filters.tags),
    )
    .sort((a, b) => compare(a, b) || byName(a, b));
}
