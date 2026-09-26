import { isAbsolute } from "node:path";
import type { BatchFailure, DeployApi, Skill, TargetConflict } from "@loadout/shared";
import type { AgentRegistry, ResolvedAgent } from "../agents/registry";
import type { CoreContext } from "../context";
import { errorMessage, invalid, isAppError } from "../errors";
import type { DeploymentRecord, SkillStore } from "../skills/store";
import { canonicalPath, lstatOrNull, targetIdentity } from "../util/fs";
import { hashDir } from "../util/hash";
import { type BatchApply, createBatchApply } from "./batch";
import { rowsAtPath, samePath } from "./evidence";
import { type DeployPair, createDeployOperations } from "./operations";

export interface DeployServiceDeps {
  store: SkillStore;
  registry: AgentRegistry;
}

/** Outcome of rewriting deployments we already own. Refusals are reported, never thrown. */
export interface RedeployReport {
  written: number;
  conflicts: TargetConflict[];
  failed: BatchFailure[];
  /** Agents whose copy was left alone because it holds changes of its own (`keepModified`). */
  kept: string[];
}

export interface RefreshOptions {
  /**
   * Leave a copy alone when its content no longer matches what was deployed, i.e. someone edited
   * it inside the agent's folder. Without this, every copy is rewritten.
   */
  keepModified?: boolean;
}

export interface DeployService {
  api: DeployApi;
  /** Like `api.apply`, for pairs that are not a full skills × agents grid (preset toggles). */
  applyPairs: BatchApply;
  /** Remove every deployment of a skill, keeping anything we cannot prove we put there. */
  removeAllForSkill(skill: Skill): Promise<void>;
  /**
   * Remove every link into the library from every agent folder, and every copy too when asked.
   * Returns how many deployment rows were dropped.
   */
  removeEverywhere(options: { includeCopies: boolean }): Promise<number>;
  /** Same, for one agent. Returns how many deployment rows were dropped. */
  removeAllForAgent(agentKey: string): Promise<number>;
  /** Re-copy every copy-mode deployment after the library content of `skill` changed. */
  refreshCopies(skill: Skill, options?: RefreshOptions): Promise<RedeployReport>;
  /**
   * Replace whatever is at the agent's target with a managed deployment. Only call this when
   * the user asked for it: nothing at the target is preserved.
   */
  adopt(skill: Skill, agent: ResolvedAgent): Promise<void>;
  /**
   * Before `skill` is renamed to `renamed`: what would stop its deployments from following. A
   * folder at the new name that is not ours is a conflict; a copy edited in the agent's folder
   * would lose its edits when it is replaced.
   */
  checkRename(skill: Skill, renamed: Skill): RenameCheck;
  /** Deploy `skill` to these agents again, e.g. after a rename. Unusable agents are reported. */
  redeploy(skill: Skill, agentKeys: readonly string[]): Promise<RedeployReport>;
  /** Follow an agent to a new skills folder: remove at the old one, deploy at the new one. */
  moveAgentDeployments(
    agentKey: string,
    oldSkillsDir: string,
    newSkillsDir: string,
  ): Promise<RedeployReport>;
}

export interface RenameCheck {
  conflicts: TargetConflict[];
  editedCopies: DeploymentRecord[];
}

/** Two paths name one entry on disk (a case-insensitive file system, a linked folder). */
function sameEntry(a: string, b: string): boolean {
  if (targetIdentity(a) === targetIdentity(b)) return true;
  const left = lstatOrNull(a);
  const right = lstatOrNull(b);
  return left !== null && right !== null && left.dev === right.dev && left.ino === right.ino;
}

const emptyReport = (): RedeployReport => ({ written: 0, conflicts: [], failed: [], kept: [] });

/** The copy at the row's path differs from the content it was made from. */
function copyWasEdited(row: DeploymentRecord): boolean {
  const stat = lstatOrNull(row.targetPath);
  // Missing: rewriting loses nothing. A link or file: the engine refuses it on its own.
  if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) return false;
  return row.sourceHash === null || hashDir(row.targetPath) !== row.sourceHash;
}

export function createDeployService(ctx: CoreContext, deps: DeployServiceDeps): DeployService {
  const { store, registry } = deps;
  const ops = createDeployOperations(ctx, store);
  const applyPairs = createBatchApply(ctx, { store, registry, ops });

  function requireAvailable(agentKey: string): ResolvedAgent {
    const agent = registry.get(agentKey);
    if (!agent.installed) throw invalid(`${agent.displayName} is not installed`);
    if (!agent.enabled) throw invalid(`${agent.displayName} is disabled in Settings`);
    return agent;
  }

  const agentName = (agentKey: string): string => registry.find(agentKey)?.displayName ?? agentKey;

  /** Try one pair and file the outcome; refusals and IO errors never stop the round. */
  async function attempt(pair: DeployPair, report: RedeployReport): Promise<void> {
    try {
      if ((await ops.deployPair(pair)) === "written") report.written += 1;
    } catch (error) {
      if (isAppError(error, "TARGET_CONFLICT")) {
        report.conflicts.push(...(error.details?.conflicts ?? []));
      } else {
        report.failed.push({ name: pair.skill.name, message: errorMessage(error) });
      }
    }
  }

  async function removeRows(what: string, rows: () => DeploymentRecord[]): Promise<number> {
    const dropped = await ctx.lock.run(what, () => {
      let count = 0;
      for (const row of rows()) {
        try {
          ops.undeployRow(row, agentName(row.agentKey));
          count += 1;
        } catch (error) {
          ctx.log.warn(`Could not remove ${row.targetPath}`, error);
        }
      }
      return count;
    });
    if (dropped > 0) ctx.touched("skills");
    return dropped;
  }

  /** A local source that is about to become a link into the library would point at itself. */
  function repointSources(targetPath: string): void {
    for (const other of store.list()) {
      const ref = other.sourceRef;
      if (!ref || !isAbsolute(ref) || !samePath(ref, targetPath)) continue;
      store.update(other.id, { sourceRef: other.libraryPath });
    }
  }

  const api: DeployApi = {
    deploy: async (skillId, agentKey) => {
      const skill = store.get(skillId);
      const agent = requireAvailable(agentKey);
      await ctx.lock.run(`deploy ${skill.name}`, () => ops.deployPair(ops.pairFor(skill, agent)));
      ctx.touched("skills");
    },

    undeploy: async (skillId, agentKey) => {
      const skill = store.get(skillId);
      await removeRows(`undeploy ${skill.name}`, () => {
        const row = store.deployment(skillId, agentKey);
        return row ? [row] : [];
      });
    },

    apply: (skillIds, agentKeys, action, options) =>
      applyPairs(
        skillIds.flatMap((skillId) => agentKeys.map((agentKey) => ({ skillId, agentKey }))),
        action,
        options,
      ),
  };

  return {
    api,
    applyPairs,

    removeAllForSkill: async (skill) => {
      await removeRows(`undeploy ${skill.name}`, () =>
        store.deployments().filter((row) => row.skillId === skill.id),
      );
    },

    removeEverywhere: ({ includeCopies }) =>
      removeRows("undeploy everything", () =>
        store.deployments().filter((row) => includeCopies || row.mode === "symlink"),
      ),

    removeAllForAgent: (agentKey) =>
      removeRows(`undeploy everything from ${agentName(agentKey)}`, () =>
        store.deploymentsForAgent(agentKey),
      ),

    refreshCopies: async (skill, options = {}) => {
      const report = emptyReport();
      await ctx.lock.run(`refresh copies of ${skill.name}`, async () => {
        const copies = store
          .deployments()
          .filter((row) => row.skillId === skill.id && row.mode === "copy");
        for (const listed of copies) {
          // Agents sharing a folder: refreshing one realigns the others' rows, so read it again.
          const row = store.deployment(listed.skillId, listed.agentKey) ?? listed;
          const stale = row.sourceHash !== skill.contentHash;
          if (options.keepModified && stale && copyWasEdited(row)) {
            report.kept.push(row.agentKey);
            continue;
          }
          // The row's own path, not the agent's present folder: we refresh what we recorded.
          const pair = {
            skill,
            agentKey: row.agentKey,
            agentName: agentName(row.agentKey),
            targetPath: row.targetPath,
          };
          await attempt(pair, report);
        }
      });
      if (report.written > 0) ctx.touched("skills");
      return report;
    },

    adopt: async (skill, agent) => {
      const pair = ops.pairFor(skill, agent);
      await ctx.lock.run(`adopt ${skill.name}`, async () => {
        repointSources(pair.targetPath);
        // Whatever other skill was recorded here is about to be replaced on the user's word.
        for (const row of rowsAtPath(store.deployments(), pair.targetPath)) {
          if (row.skillId !== skill.id) store.deleteDeployment(row.skillId, row.agentKey);
        }
        await ops.deployPair(pair, { kind: "user_confirmed" });
      });
      ctx.touched("skills");
    },

    checkRename: (skill, renamed) => {
      const check: RenameCheck = { conflicts: [], editedCopies: [] };
      for (const row of store.deployments().filter((entry) => entry.skillId === skill.id)) {
        if (row.mode === "copy" && copyWasEdited(row)) check.editedCopies.push(row);
        const agent = registry.find(row.agentKey);
        if (!agent?.installed || !agent.enabled) continue;
        const refusal = ops.inspect(ops.pairFor(renamed, agent)).refusal;
        // The skill's own deployment under a name differing only in case is not in the way.
        if (refusal && !sameEntry(refusal.path, row.targetPath)) {
          check.conflicts.push(refusal);
        }
      }
      return check;
    },

    redeploy: async (skill, agentKeys) => {
      const report = emptyReport();
      await ctx.lock.run(`deploy ${skill.name}`, async () => {
        for (const key of new Set(agentKeys)) {
          const agent = registry.find(key);
          if (agent?.installed && agent.enabled) await attempt(ops.pairFor(skill, agent), report);
          else
            report.failed.push({ name: skill.name, message: `${agentName(key)} is not available` });
        }
      });
      ctx.touched("skills");
      return report;
    },

    moveAgentDeployments: async (agentKey, oldSkillsDir, newSkillsDir) => {
      const report = emptyReport();
      if (canonicalPath(oldSkillsDir) === canonicalPath(newSkillsDir)) return report;
      await ctx.lock.run(`move deployments of ${agentName(agentKey)}`, async () => {
        const agent = registry.find(agentKey);
        const rows = store.deploymentsForAgent(agentKey);
        const available = agent !== null && agent.installed && agent.enabled;
        for (const row of rows) {
          const skill = store.find(row.skillId);
          try {
            ops.undeployRow(row, agentName(agentKey));
          } catch (error) {
            report.failed.push({ name: skill?.name ?? row.skillId, message: errorMessage(error) });
            continue;
          }
          if (skill && available) await attempt(ops.pairFor(skill, agent, newSkillsDir), report);
        }
      });
      ctx.touched("skills");
      return report;
    },
  };
}
