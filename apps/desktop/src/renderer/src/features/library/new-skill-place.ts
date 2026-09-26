import type { LocalSkill, Project, ProjectTarget } from "@loadout/shared";
// Relative imports (not `@/`) so this module stays loadable by plain vitest.
import type { AgentTargetChip } from "../../components/AgentTargetChips";
import { orderedAvailableTargets, targetOfAgent } from "../projects/project-skill-groups";

/** The place id of the library in the "Create in" choice; any other id is a project's. */
export const LIBRARY_PLACE = "library";

/**
 * Folders a new project skill can go to. A linked workspace always writes to all of its own; a
 * project offers the agents that are installed and switched on, the usual ones first.
 */
export function placeTargets(project: Project, targets: readonly ProjectTarget[]): ProjectTarget[] {
  return project.type === "linked" ? [...targets] : orderedAvailableTargets(targets);
}

/**
 * The chips ticked at first: the agents chosen the last time skills went into this project, or
 * else only the first one. A new skill starts small; ticking more is one click.
 */
export function defaultChipKeys(
  chips: readonly AgentTargetChip[],
  targets: readonly ProjectTarget[],
  remembered: readonly string[],
): Set<string> {
  const saved = remembered.flatMap((key) => targetOfAgent(targets, key)?.key ?? []);
  const keys = saved.length > 0 ? saved : chips.slice(0, 1).map((chip) => chip.key);
  return new Set(keys.filter((key) => chips.some((chip) => chip.key === key)));
}

/** Folder names (lower-cased) the chosen agent folders already hold, on or off. */
export function takenInFolders(
  skills: readonly LocalSkill[],
  targetKeys: ReadonlySet<string>,
): Set<string> {
  return new Set(
    skills
      .filter((skill) => targetKeys.has(skill.agentKey))
      .map((skill) => (skill.relativePath.split("/")[0] ?? "").toLowerCase()),
  );
}
