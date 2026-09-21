import { join } from "node:path";
import { AGENT_CONTROL_SKILL_NAME, type AgentControlStatus, type Skill } from "@loadout/shared";
import type { AgentRegistry } from "../agents/registry";
import type { CoreContext } from "../context";
import { AppError, invalid, notFound, targetConflict, unsupported } from "../errors";
import type { DeployService } from "../deploy";
import type { InstallService } from "../install";
import type { SkillStore } from "../skills/store";
import { isSkillDir } from "../util/fs";

export interface AgentControlDeps {
  store: SkillStore;
  install: Pick<InstallService, "installIntoLibrary">;
  deploy: Pick<DeployService, "api">;
  registry: AgentRegistry;
}

export interface AgentControl {
  status(): AgentControlStatus;
  setup(agentKeys: string[]): Promise<Skill>;
  dismiss(): void;
}

/** One-click setup of the bundled skill that teaches agents to drive the command-line tool. */
export function createAgentControl(ctx: CoreContext, deps: AgentControlDeps): AgentControl {
  const { store, install, deploy, registry } = deps;

  const installedSkill = (): Skill | null =>
    store.findByName(AGENT_CONTROL_SKILL_NAME).find((s) => s.name === AGENT_CONTROL_SKILL_NAME) ??
    null;

  function status(): AgentControlStatus {
    const skill = installedSkill();
    return {
      installed: skill !== null,
      skillId: skill?.id ?? null,
      dismissed: ctx.settings.get("agentControlPrompt") === "dismissed",
    };
  }

  function bundledSource(): string {
    if (!ctx.host.bundledSkillDir) {
      throw unsupported("This build does not include the agent management skill.");
    }
    const sourceDir = join(ctx.host.bundledSkillDir, AGENT_CONTROL_SKILL_NAME);
    if (!isSkillDir(sourceDir)) {
      throw notFound(`The bundled "${AGENT_CONTROL_SKILL_NAME}" skill is missing from this build.`);
    }
    return sourceDir;
  }

  async function setup(agentKeys: string[]): Promise<Skill> {
    const keys = [...new Set(agentKeys)];
    // Everything that can be refused is refused before the library is touched.
    const sourceDir = bundledSource();
    for (const key of keys) {
      const agent = registry.get(key);
      if (!agent.installed) throw invalid(`${agent.displayName} is not installed.`);
      if (!agent.enabled) throw invalid(`${agent.displayName} is disabled in Settings.`);
    }

    const skill = await install.installIntoLibrary({
      sourceDir,
      name: AGENT_CONTROL_SKILL_NAME,
      // Running setup again after an app update refreshes the same skill instead of adding "-2".
      record: {
        sourceType: "local",
        sourceRef: sourceDir,
        updateStatus: "local_only",
        replaceSkillId: installedSkill()?.id ?? null,
      },
    });
    ctx.settings.set("agentControlPrompt", "installed");
    ctx.touched("settings");

    if (keys.length > 0) {
      const result = await deploy.api.apply([skill.id], keys, "add");
      if (result.conflicts.length > 0) throw targetConflict(result.conflicts);
      const failure = result.failed[0];
      if (failure) {
        throw new AppError("IO", `The skill was installed but not deployed: ${failure.message}`);
      }
    }
    return store.get(skill.id);
  }

  function dismiss(): void {
    ctx.settings.set("agentControlPrompt", "dismissed");
    ctx.touched("settings");
  }

  return { status, setup, dismiss };
}
