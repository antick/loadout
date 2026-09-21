import { join } from "node:path";
import { BUILT_IN_AGENTS, type ProjectTarget } from "@loadout/shared";
import type { AgentRegistry, ResolvedAgent } from "../agents/registry";
import type { ProjectRecord } from "./store";

/** A project target with the folders it reads on this machine. */
export interface ResolvedTarget extends ProjectTarget {
  enabledRoot: string;
  /** Where switched-off skills are parked; null when the workspace cannot switch skills off. */
  disabledRoot: string | null;
  /** The parking folder is ours to delete once it is empty (we create it on demand). */
  ownsDisabledRoot: boolean;
}

/** Appended to a skills folder to name the folder its switched-off skills are moved to. */
export const DISABLED_SUFFIX = "-disabled";
/** Agent every new project gets folders for, and the default when exporting without a choice. */
export const DEFAULT_PROJECT_AGENT_KEY = "claude_code";
const NAME_SEPARATOR = " / ";

const normalizeRelativeDir = (dir: string): string =>
  dir
    .split(/[\\/]+/)
    .filter(Boolean)
    .join("/");

export const isAvailable = (target: ProjectTarget): boolean => target.installed && target.enabled;

/** The target an agent key belongs to: its own, or the merged one it shares a folder with. */
export function findTarget(targets: ResolvedTarget[], agentKey: string): ResolvedTarget | null {
  return (
    targets.find((target) => target.key === agentKey) ??
    targets.find((target) => target.agentKeys.includes(agentKey)) ??
    null
  );
}

/** Project-relative skills folder of the default agent, honouring a user override. */
export function defaultProjectSkillsDir(registry: AgentRegistry): string | null {
  const dir = registry.find(DEFAULT_PROJECT_AGENT_KEY)?.projectSkillsDir;
  return dir ? normalizeRelativeDir(dir) : null;
}

/** Every distinct project-relative skills folder any agent uses. */
export function projectSkillDirs(registry: AgentRegistry): string[] {
  const dirs = registry
    .list()
    .flatMap((agent) => (agent.projectSkillsDir ? [agent.projectSkillsDir] : []))
    .map(normalizeRelativeDir)
    .filter(Boolean);
  return [...new Set(dirs)];
}

/**
 * Who stands for a merged target. The key must not change when the user reorders agents (it is
 * saved with export choices), so it is the first member in registration order. Whether the target
 * can be used is asked of the first member that can use it: one installed agent is enough to
 * make a shared folder worth writing to.
 */
function mergeAgents(
  relativeDir: string,
  first: ResolvedAgent,
  members: ResolvedAgent[],
  root: string,
): ResolvedTarget {
  const usable =
    members.find((agent) => agent.installed && agent.enabled) ??
    members.find((agent) => agent.installed) ??
    first;
  const enabledRoot = join(root, relativeDir);
  return {
    key: first.key,
    displayName: members.map((agent) => agent.displayName).join(NAME_SEPARATOR),
    agentKeys: members.map((agent) => agent.key),
    relativeDir,
    enabled: usable.enabled,
    installed: usable.installed,
    isCustom: first.isCustom,
    enabledRoot,
    disabledRoot: `${enabledRoot}${DISABLED_SUFFIX}`,
    ownsDisabledRoot: true,
  };
}

/** A linked workspace is one skills root standing in for an agent of its own. */
function linkedTarget(project: ProjectRecord): ResolvedTarget {
  const key = project.linkedAgentKey ?? project.id;
  return {
    key,
    displayName: project.name,
    agentKeys: [key],
    relativeDir: "",
    enabled: true,
    installed: true,
    isCustom: false,
    enabledRoot: project.path,
    disabledRoot: project.disabledPath,
    // The user chose this folder (or we made it once, when linking); it is never pruned away.
    ownsDisabledRoot: false,
  };
}

/**
 * Where skills live in a workspace. Agents that resolve to the same project-relative folder are
 * one target, in the user's agent order; agents without a project folder are left out.
 */
export function resolveTargets(project: ProjectRecord, registry: AgentRegistry): ResolvedTarget[] {
  if (project.type === "linked") return [linkedTarget(project)];

  const registration = new Map<string, number>(
    [...BUILT_IN_AGENTS, ...registry.customAgents()].map((agent, index) => [agent.key, index]),
  );
  const rank = (agent: ResolvedAgent): number =>
    registration.get(agent.key) ?? Number.MAX_SAFE_INTEGER;

  const groups = new Map<string, ResolvedAgent[]>();
  for (const agent of registry.list()) {
    const relativeDir = agent.projectSkillsDir ? normalizeRelativeDir(agent.projectSkillsDir) : "";
    if (!relativeDir) continue;
    groups.set(relativeDir, [...(groups.get(relativeDir) ?? []), agent]);
  }
  return [...groups].flatMap(([relativeDir, members]) => {
    const sorted = [...members].sort((a, b) => rank(a) - rank(b));
    const first = sorted[0];
    return first ? [mergeAgents(relativeDir, first, sorted, project.path)] : [];
  });
}
