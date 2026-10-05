import { existsSync } from "node:fs";
import type { RepairFailure, RepairReport, RepairedDeployment } from "@loadout/shared";
import type { AgentRegistry } from "../agents/registry";
import type { CoreContext } from "../context";
import { errorMessage } from "../errors";
import type { SkillStore } from "../skills/store";
import { deploymentState } from "./state";
import type { DeployService } from "./service";

export interface DeployRepairDeps {
  store: SkillStore;
  registry: AgentRegistry;
  deploy: Pick<DeployService, "putBack">;
}

export interface DeployRepair {
  /** Put back every deployment Loadout recorded that is missing or a broken link. */
  run(): Promise<RepairReport>;
  /** The last run's report, or null before the first run or after a dismiss. */
  last(): RepairReport | null;
  dismiss(): void;
}

const SKILL_GONE = "The skill's folder is missing from the library.";

/**
 * Deployments Loadout recorded whose entry went missing, or whose link leads elsewhere (the
 * library moved, a folder was cleared): each is deployed again the normal way (see
 * `deploymentState`). Something Loadout did not put there is never replaced: it is listed apart
 * from failures, so it is not retried as one at every start. Agents that are not installed or
 * switched off are left alone and counted. Runs when the app starts and on request.
 */
export function createDeployRepair(ctx: CoreContext, deps: DeployRepairDeps): DeployRepair {
  let last: RepairReport | null = null;

  async function run(): Promise<RepairReport> {
    const agents = deps.registry.list();
    const available = new Set(
      agents.filter((agent) => agent.installed && agent.enabled).map((agent) => agent.key),
    );
    const names = new Map(agents.map((agent) => [agent.key, agent.displayName]));
    const agentName = (key: string): string => names.get(key) ?? key;
    const repaired: RepairedDeployment[] = [];
    const notOurs: RepairedDeployment[] = [];
    const failed: RepairFailure[] = [];
    let checked = 0;
    let skippedAgents = 0;
    for (const row of deps.store.deployments()) {
      if (!available.has(row.agentKey)) {
        skippedAgents += 1;
        continue;
      }
      checked += 1;
      const skill = deps.store.find(row.skillId);
      const state = skill ? deploymentState(row, skill) : "ok";
      if (!skill || state === "ok") continue;
      const entry = {
        skill: skill.name,
        agentKey: row.agentKey,
        agent: agentName(row.agentKey),
        path: row.targetPath,
      };
      // Not Loadout's to replace, so trying again at every start would only fail again.
      if (state === "not_ours") {
        notOurs.push(entry);
        continue;
      }
      if (!existsSync(skill.libraryPath)) {
        failed.push({ ...entry, message: SKILL_GONE });
        continue;
      }
      try {
        // Where it was recorded: the agent's folder may read differently right now.
        await deps.deploy.putBack(row);
        repaired.push(entry);
      } catch (error) {
        failed.push({ ...entry, message: errorMessage(error) });
      }
    }
    last = { ranAt: Date.now(), checked, repaired, notOurs, failed, skippedAgents };
    if (repaired.length > 0) {
      ctx.log.info(`Put back ${repaired.length} deployments that were missing`);
    }
    for (const failure of failed) {
      ctx.log.warn(`Could not put back ${failure.path}: ${failure.message}`);
    }
    ctx.emit("deploy:repaired", last);
    return last;
  }

  return {
    run,
    last: () => last,
    dismiss: () => {
      last = null;
    },
  };
}
