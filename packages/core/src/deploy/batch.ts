import type { ApplyResult, TargetConflict } from "@loadout/shared";
import type { AgentRegistry } from "../agents/registry";
import type { CoreContext } from "../context";
import { errorMessage } from "../errors";
import type { SkillStore } from "../skills/store";
import { targetIdentity } from "../util/fs";
import { samePath } from "./evidence";
import type { DeployOperations, DeployPair } from "./operations";

export interface PairRef {
  skillId: string;
  agentKey: string;
}

export interface BatchDeps {
  store: SkillStore;
  registry: AgentRegistry;
  ops: DeployOperations;
}

export type BatchApply = (pairs: PairRef[], action: "add" | "remove") => Promise<ApplyResult>;

export const REASON_TWO_SKILLS = "is claimed by two different skills";
const MISSING_SKILL_MESSAGE = "This skill is no longer in the library";

const emptyResult = (): ApplyResult => ({
  added: 0,
  removed: 0,
  skipped: 0,
  conflicts: [],
  failed: [],
});

export function createBatchApply(ctx: CoreContext, deps: BatchDeps): BatchApply {
  const { store, registry, ops } = deps;

  /** Resolve every pair, dropping the ones that need no work. Touches nothing on disk. */
  function plan(refs: PairRef[], result: ApplyResult): DeployPair[] {
    const agents = new Map(registry.available().map((agent) => [agent.key, agent]));
    const planned: DeployPair[] = [];
    const seen = new Set<string>();
    const missing = new Set<string>();
    for (const ref of refs) {
      const pairKey = `${ref.skillId}\n${ref.agentKey}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);
      const skill = store.find(ref.skillId);
      if (!skill) {
        if (!missing.has(ref.skillId)) {
          result.failed.push({ name: ref.skillId, message: MISSING_SKILL_MESSAGE });
        }
        missing.add(ref.skillId);
        continue;
      }
      const agent = agents.get(ref.agentKey);
      if (!agent) {
        result.skipped += 1;
        continue;
      }
      const pair = ops.pairFor(skill, agent);
      const row = store.deployment(skill.id, agent.key);
      const deployed = row !== null && samePath(row.targetPath, pair.targetPath);
      if (deployed && ops.inspect(pair).current) {
        result.skipped += 1;
        continue;
      }
      planned.push(pair);
    }
    return planned;
  }

  /** One entry per path: a folder shared by two agents must not be reported twice. */
  function findConflicts(planned: DeployPair[]): TargetConflict[] {
    const conflicts = new Map<string, TargetConflict>();
    const claimedBy = new Map<string, string>();
    for (const pair of planned) {
      const identity = targetIdentity(pair.targetPath);
      const claimant = claimedBy.get(identity) ?? pair.skill.id;
      claimedBy.set(identity, claimant);
      const refusal =
        claimant === pair.skill.id
          ? ops.inspect(pair).refusal
          : { path: pair.targetPath, reason: REASON_TWO_SKILLS };
      if (refusal && !conflicts.has(identity)) conflicts.set(identity, refusal);
    }
    return [...conflicts.values()];
  }

  async function add(refs: PairRef[]): Promise<ApplyResult> {
    const result = emptyResult();
    const planned = plan(refs, result);
    result.conflicts = findConflicts(planned);
    // All or nothing: one target we may not replace means the whole request is reconsidered.
    if (result.conflicts.length > 0) return result;
    for (const pair of planned) {
      try {
        // Ownership is judged again from the rows as they are now, so the second agent of a
        // shared folder sees what the first one just wrote as ours.
        if ((await ops.deployPair(pair)) === "written") result.added += 1;
        else result.skipped += 1;
      } catch (error) {
        result.failed.push({ name: pair.skill.name, message: errorMessage(error) });
      }
    }
    return result;
  }

  function remove(refs: PairRef[]): ApplyResult {
    const result = emptyResult();
    for (const ref of refs) {
      const row = store.deployment(ref.skillId, ref.agentKey);
      if (!row) {
        result.skipped += 1;
        continue;
      }
      try {
        ops.undeployRow(row, registry.find(ref.agentKey)?.displayName);
        result.removed += 1;
      } catch (error) {
        const name = store.find(ref.skillId)?.name ?? ref.skillId;
        result.failed.push({ name, message: errorMessage(error) });
      }
    }
    return result;
  }

  return async (refs, action) => {
    const result = await ctx.lock.run(action === "add" ? "deploy skills" : "undeploy skills", () =>
      action === "add" ? add(refs) : remove(refs),
    );
    if (result.added + result.removed > 0) ctx.touched("skills");
    return result;
  };
}
