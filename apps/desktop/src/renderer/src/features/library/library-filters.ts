import {
  SOURCE_TYPES,
  type SafetyRecord,
  type Skill,
  type SkillUsage,
  type SourceType,
  type UpdateStatus,
  hasSkillErrors,
  isUnusedSkill,
  matchesSkillQuery,
  runsCode,
} from "@loadout/shared";
import { matchesTagFilter } from "@/lib/tag-filter";

export const FILTER_ALL = "all";

export const SOURCE_FILTERS = [FILTER_ALL, ...SOURCE_TYPES] as const;
export type SourceFilter = typeof FILTER_ALL | SourceType;

export const STATUS_FILTERS = [
  FILTER_ALL,
  "deployed",
  "deployed_all",
  "deployed_some",
  "not_deployed",
  "updates",
  "attention",
  "runs_code",
  "flagged",
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

const NO_USAGE: UsageLookup = { enabled: false, byId: new Map() };

/** The last safety report of each skill by id; a report that still holds and is not "safe". */
export type SafetyLookup = ReadonlyMap<string, SafetyRecord>;
const NO_SAFETY: SafetyLookup = new Map();

export function isSafetyFlagged(skill: Pick<Skill, "id">, safety: SafetyLookup): boolean {
  const record = safety.get(skill.id);
  return record !== undefined && !record.stale && record.verdict !== "safe";
}

export interface LibraryFilters {
  query: string;
  source: SourceFilter;
  status: StatusFilter;
  tags: readonly string[];
  /** Only favourites. Combines with the rest. */
  favorites: boolean;
  sort: SortMode;
}

export const EMPTY_FILTERS: Omit<LibraryFilters, "sort"> = {
  query: "",
  source: FILTER_ALL,
  status: FILTER_ALL,
  tags: [],
  favorites: false,
};

export function isFavorite(skill: Pick<Skill, "favoritedAt">): boolean {
  return skill.favoritedAt !== null;
}

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

/** Agent keys that can take skills right now; "on every agent" is measured against these. */
export type AgentKeys = ReadonlySet<string>;
const NO_AGENTS: AgentKeys = new Set();

/**
 * Every agent that can take the skill has it. Agents it is blocked for do not count against it,
 * and a skill with nowhere to go is never "on every agent".
 */
export function isOnEveryAgent(skill: Skill, available: AgentKeys): boolean {
  const eligible = [...available].filter((key) => !skill.blockedAgents.includes(key));
  return (
    eligible.length > 0 &&
    eligible.every((key) => skill.deployments.some((deployment) => deployment.agentKey === key))
  );
}

function matchesStatus(
  skill: Skill,
  status: StatusFilter,
  usage: UsageLookup,
  available: AgentKeys,
  safety: SafetyLookup,
): boolean {
  switch (status) {
    case "flagged":
      return isSafetyFlagged(skill, safety);
    case "unused":
      return !usage.enabled || isUnusedSkill(skill, usage.byId);
    case "deployed":
      return skill.deployments.length > 0;
    case "deployed_all":
      return isOnEveryAgent(skill, available);
    case "deployed_some":
      return skill.deployments.length > 0 && !isOnEveryAgent(skill, available);
    case "not_deployed":
      return skill.deployments.length === 0;
    case "updates":
      return hasUpdate(skill);
    case "attention":
      return needsAttention(skill);
    case "runs_code":
      return runsCode(skill.traits);
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
    filters.tags.length > 0 ||
    filters.favorites
  );
}

/**
 * Search (name, description, tags, note, source), then source, status, favourite and tag filters,
 * then sort.
 * `available` is the agents that can take skills, for the "on every agent" filters.
 */
export function filterSkills(
  skills: readonly Skill[],
  filters: LibraryFilters,
  usage: UsageLookup = NO_USAGE,
  available: AgentKeys = NO_AGENTS,
  safety: SafetyLookup = NO_SAFETY,
): Skill[] {
  const compare = comparator(filters.sort, usage);
  return skills
    .filter(
      (skill) =>
        matchesSkillQuery(skill, filters.query) &&
        (filters.source === FILTER_ALL || skill.sourceType === filters.source) &&
        matchesStatus(skill, filters.status, usage, available, safety) &&
        (!filters.favorites || isFavorite(skill)) &&
        matchesTagFilter(skill.tags, filters.tags),
    )
    .sort((a, b) => compare(a, b) || byName(a, b));
}
