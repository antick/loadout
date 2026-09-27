import { join } from "node:path";
import type { DeployMode, RemovedReason, Skill, TargetConflict } from "@loadout/shared";
import type { ResolvedAgent } from "../agents/registry";
import type { CoreContext } from "../context";
import { targetConflict } from "../errors";
import type { DeploymentRecord, SkillStore } from "../skills/store";
import type { RemovedStore } from "../storage/removed";
import { lstatOrNull } from "../util/fs";
import { hashDir } from "../util/hash";
import {
  type OwnershipPolicy,
  type TargetState,
  authorize,
  classifyTarget,
  removeTarget,
  usableMode,
  writeTarget,
} from "./engine";
import { copyWasEdited, isCurrent, policyFromRows, rowsAtPath, samePath } from "./evidence";

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
export function createDeployOperations(
  ctx: CoreContext,
  store: SkillStore,
  removed?: Pick<RemovedStore, "setAside" | "putBack">,
): DeployOperations {
  /**
   * A copy edited inside the agent's folder is about to be overwritten or deleted: put it in
   * Recently removed instead. The entry's id when it was moved away, so the path is free.
   */
  function setAsideEdited(
    rows: DeploymentRecord[],
    place: string,
    reason: RemovedReason,
    libraryHash: string | null,
  ): string | null {
    if (!removed) return null;
    const edited = rows.find((row) => row.mode === "copy" && copyWasEdited(row));
    // Already the library's content (a pull put it there): nothing of the user's to keep.
    if (!edited || hashDir(edited.targetPath) === libraryHash) return null;
    return removed.setAside(edited.targetPath, { place, reason });
  }

  function inspect(pair: DeployPair, forced?: OwnershipPolicy): TargetCheck {
    const { skill, targetPath } = pair;
    const rows = rowsAtPath(store.deployments(), targetPath);
    const policy = forced ?? policyFromRows(rows);
    const state = classifyTarget(targetPath, skill.libraryPath);
    const mode = usableMode(targetPath, ctx.settings.get("deployMode"));
    const current = isCurrent(state, rows, skill, mode);
    let reason: string | null = null;
    if (!forced && rows.some((row) => row.skillId !== skill.id)) reason = REASON_OTHER_SKILL;
    else if (!current) reason = authorize(state, policy);
    return { state, rows, policy, current, refusal: reason ? { path: targetPath, reason } : null };
  }

  /**
   * The path is ours to remove only when no row of any skill or agent still points at it, and
   * only if it still looks like what `row` recorded. When in doubt the content stays.
   */
  function releasePath(row: DeploymentRecord, place = row.agentKey): boolean {
    let survivors: DeploymentRecord[];
    try {
      survivors = rowsAtPath(store.deployments(), row.targetPath);
    } catch (error) {
      ctx.log.warn(`Kept ${row.targetPath}: could not check who else uses it`, error);
      return false;
    }
    if (survivors.length > 0) return false;
    const libraryHash = store.find(row.skillId)?.contentHash ?? null;
    if (setAsideEdited([row], place, "deleted", libraryHash) !== null) return true;
    const gone = removeTarget(row.targetPath, row.mode);
    if (!gone && lstatOrNull(row.targetPath)) {
      ctx.log.warn(`Kept ${row.targetPath}: it no longer matches its recorded ${row.mode}`);
    }
    return gone;
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
    const wanted = usableMode(targetPath, ctx.settings.get("deployMode"));
    const before = store.deployment(skill.id, agentKey);
    const check = inspect(pair, forced);
    if (check.refusal) throw targetConflict([check.refusal]);

    let used: DeployMode;
    if (check.current) {
      used = check.state === "link_to_source" ? "symlink" : "copy";
    } else {
      const keptId = setAsideEdited(check.rows, pair.agentName, "replaced", skill.contentHash);
      try {
        used = await writeTarget(skill.libraryPath, targetPath, wanted, check.policy);
      } catch (error) {
        // The agent keeps its own copy rather than being left with nothing.
        if (keptId) removed?.putBack(keptId);
        throw error;
      }
      if (used !== wanted) ctx.log.warn(`Could not link ${targetPath}; copied the skill instead`);
    }
    const sameSkillRows = check.rows.filter((row) => row.skillId === skill.id);
    alignRows(sameSkillRows, used, skill.contentHash);

    const recorded = before !== null && samePath(before.targetPath, targetPath);
    if (check.current && recorded) return "unchanged";
    store.upsertDeployment(skill.id, agentKey, targetPath, used, skill.contentHash);
    // The agent's folder moved or the skill was renamed: the old spot is no longer wanted.
    if (before && !recorded) releasePath(before, pair.agentName);
    ctx.activity.record("deploy", skill.name, pair.agentName);
    return "written";
  }

  function undeployRow(row: DeploymentRecord, agentName = row.agentKey): boolean {
    const skillName = store.find(row.skillId)?.name ?? row.skillId;
    store.deleteDeployment(row.skillId, row.agentKey);
    const released = releasePath(row, agentName);
    ctx.activity.record("undeploy", skillName, agentName);
    return released;
  }

  return { pairFor, inspect, deployPair, undeployRow };
}
