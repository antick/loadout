import { join } from "node:path";
import type { DeployMode, Skill, TargetConflict } from "@skillboard/shared";
import type { ResolvedAgent } from "../agents/registry";
import type { CoreContext } from "../context";
import { targetConflict } from "../errors";
import type { DeploymentRecord, SkillStore } from "../skills/store";
import { lstatOrNull } from "../util/fs";
import {
  type OwnershipPolicy,
  type TargetState,
  authorize,
  classifyTarget,
  removeTarget,
  writeTarget,
} from "./engine";
import { isCurrent, policyFromRows, rowsAtPath, samePath } from "./evidence";

export const REASON_OTHER_SKILL = "already holds a different skill's deployment";

/** One skill going to one agent's folder. `agentName` is only for the activity history. */
export interface DeployPair {
  skill: Skill;
  agentKey: string;
  agentName: string;
  targetPath: string;
}

/** What stands at a pair's target right now, and whether we may write there. */
export interface TargetCheck {
  state: TargetState;
  /** Rows of every agent that point at this path. */
  rows: DeploymentRecord[];
  policy: OwnershipPolicy;
  /** The target already holds the skill's current content. */
  current: boolean;
  refusal: TargetConflict | null;
}

export type DeployOutcome = "written" | "unchanged";

export interface DeployOperations {
  pairFor(skill: Skill, agent: ResolvedAgent, skillsDir?: string): DeployPair;
  inspect(pair: DeployPair, policy?: OwnershipPolicy): TargetCheck;
  deployPair(pair: DeployPair, policy?: OwnershipPolicy): Promise<DeployOutcome>;
  undeployRow(row: DeploymentRecord, agentName?: string): boolean;
}

/** The target is named after the library folder, not the display name, so it stays unique. */
function pairFor(skill: Skill, agent: ResolvedAgent, skillsDir = agent.skillsDir): DeployPair {
  return {
    skill,
    agentKey: agent.key,
    agentName: agent.displayName,
    targetPath: join(skillsDir, skill.dirName),
  };
}

/** The single-pair building blocks. Callers hold the library lock. */
export function createDeployOperations(ctx: CoreContext, store: SkillStore): DeployOperations {
  function inspect(pair: DeployPair, forced?: OwnershipPolicy): TargetCheck {
    const { skill, targetPath } = pair;
    const rows = rowsAtPath(store.deployments(), targetPath);
    const policy = forced ?? policyFromRows(rows);
    const state = classifyTarget(targetPath, skill.libraryPath);
    const current = isCurrent(state, rows, skill, ctx.settings.get("deployMode"));
    let reason: string | null = null;
    if (!forced && rows.some((row) => row.skillId !== skill.id)) reason = REASON_OTHER_SKILL;
    else if (!current) reason = authorize(state, policy);
    return { state, rows, policy, current, refusal: reason ? { path: targetPath, reason } : null };
  }

  /**
   * The path is ours to remove only when no row of any skill or agent still points at it, and
   * only if it still looks like what `row` recorded. When in doubt the content stays.
   */
  function releasePath(row: DeploymentRecord): boolean {
    let survivors: DeploymentRecord[];
    try {
      survivors = rowsAtPath(store.deployments(), row.targetPath);
    } catch (error) {
      ctx.log.warn(`Kept ${row.targetPath}: could not check who else uses it`, error);
      return false;
    }
    if (survivors.length > 0) return false;
    const removed = removeTarget(row.targetPath, row.mode);
    if (!removed && lstatOrNull(row.targetPath)) {
      ctx.log.warn(`Kept ${row.targetPath}: it no longer matches its recorded ${row.mode}`);
    }
    return removed;
  }

  /** Agents sharing the folder must agree on what is there, or the path stops being provable. */
  function alignRows(rows: DeploymentRecord[], mode: DeployMode, hash: string | null): void {
    for (const row of rows) {
      if (row.mode === mode && row.sourceHash === hash) continue;
      store.upsertDeployment(row.skillId, row.agentKey, row.targetPath, mode, hash);
    }
  }

  async function deployPair(pair: DeployPair, forced?: OwnershipPolicy): Promise<DeployOutcome> {
    const { skill, agentKey, targetPath } = pair;
    const wanted = ctx.settings.get("deployMode");
    const before = store.deployment(skill.id, agentKey);
    const check = inspect(pair, forced);
    if (check.refusal) throw targetConflict([check.refusal]);

    let used: DeployMode;
    if (check.current) {
      used = check.state === "link_to_source" ? "symlink" : "copy";
    } else {
      used = await writeTarget(skill.libraryPath, targetPath, wanted, check.policy);
      if (used !== wanted) ctx.log.warn(`Could not link ${targetPath}; copied the skill instead`);
    }
    const sameSkillRows = check.rows.filter((row) => row.skillId === skill.id);
    alignRows(sameSkillRows, used, skill.contentHash);

    const recorded = before !== null && samePath(before.targetPath, targetPath);
    if (check.current && recorded) return "unchanged";
    store.upsertDeployment(skill.id, agentKey, targetPath, used, skill.contentHash);
    // The agent's folder moved or the skill was renamed: the old spot is no longer wanted.
    if (before && !recorded) releasePath(before);
    ctx.activity.record("deploy", skill.name, pair.agentName);
    return "written";
  }

  function undeployRow(row: DeploymentRecord, agentName = row.agentKey): boolean {
    const skillName = store.find(row.skillId)?.name ?? row.skillId;
    store.deleteDeployment(row.skillId, row.agentKey);
    const removed = releasePath(row);
    ctx.activity.record("undeploy", skillName, agentName);
    return removed;
  }

  return { pairFor, inspect, deployPair, undeployRow };
}
