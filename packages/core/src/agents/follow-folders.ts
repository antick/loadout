import { dirname } from "node:path";
import type { CoreContext } from "../context";
import type { DeployService } from "../deploy";
import type { SkillStore } from "../skills/store";
import { canonicalPath } from "../util/fs";
import type { AgentRegistry } from "./registry";
import { logRedeployProblems } from "../deploy/report-log";

/** Deployments of one agent moved to where its folder is now. */
export interface FolderMove {
  agentKey: string;
  from: string;
  to: string;
  moved: number;
}

export interface FollowFolderDeps {
  registry: AgentRegistry;
  store: SkillStore;
  deploy: Pick<DeployService, "moveAgentDeployments">;
}

/**
 * An agent's folder can move without the user touching Loadout: its home variable
 * (`CODEX_HOME`, …) changed, or it went away and the default applies again. The agent then no
 * longer sees what Loadout put in the old folder, so those deployments follow it.
 *
 * Only the desktop app calls this: a terminal can set a variable for one session, and a CLI run
 * there must not move every skill of that agent. A folder chosen in Settings is left to the
 * move that happens when it is chosen; custom agents only ever have a chosen folder. An agent
 * that is not installed or is switched off at the new folder keeps its deployments where they are.
 */
export async function followMovedAgentFolders(
  ctx: CoreContext,
  deps: FollowFolderDeps,
): Promise<FolderMove[]> {
  const overrides = deps.registry.pathOverrides();
  const moves: FolderMove[] = [];
  for (const agent of deps.registry.list()) {
    if (agent.isCustom || overrides[agent.key] || !agent.installed || !agent.enabled) continue;
    const rows = deps.store.deploymentsForAgent(agent.key);
    const folders = new Set(rows.map((row) => canonicalPath(dirname(row.targetPath))));
    // Rows spread over several folders were placed on purpose; nothing to follow.
    if (folders.size !== 1) continue;
    if (folders.has(canonicalPath(agent.skillsDir))) continue;
    // As recorded, for the log and the caller; the comparison above is on real paths.
    const from = dirname(rows[0]?.targetPath ?? "");
    const report = await deps.deploy.moveAgentDeployments(agent.key, from, agent.skillsDir);
    logRedeployProblems(ctx.log, report, "move");
    ctx.log.info(
      `${agent.displayName} now reads ${agent.skillsDir}: moved ${report.written} skills from ${from}`,
    );
    moves.push({ agentKey: agent.key, from, to: agent.skillsDir, moved: report.written });
  }
  if (moves.length > 0) ctx.touched("skills", "agents");
  return moves;
}
