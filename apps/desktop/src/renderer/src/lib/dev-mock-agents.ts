/** DEV ONLY. `agents.*` for the browser preview: the agent list, switches, order and folders. */
import {
  type AgentInfo,
  type CustomAgentInput,
  type DataScope,
  type ErrorCode,
  isWslPath,
} from "@loadout/shared";
import { HOME } from "@/lib/dev-mock-data";
import type { MockHandlers } from "@/lib/dev-mock-types";

export interface AgentsMockContext {
  agents: AgentInfo[];
  emitChanged(...scope: DataScope[]): void;
  fail(code: ErrorCode, message: string): never;
}

export function createAgentsMockHandlers(ctx: AgentsMockContext): MockHandlers {
  const { agents } = ctx;
  const patchAgent = (key: string, patch: Partial<AgentInfo>): void => {
    const index = agents.findIndex((agent) => agent.key === key);
    const current = agents[index];
    if (!current) ctx.fail("NOT_FOUND", `There is no agent "${key}".`);
    agents[index] = { ...current, ...patch };
    ctx.emitChanged("agents");
  };

  return {
    "agents.list": () => [...agents],
    "agents.setEnabled": (key: string, enabled: boolean) => patchAgent(key, { enabled }),
    "agents.setAllEnabled": (enabled: boolean) => {
      agents.splice(0, agents.length, ...agents.map((agent) => ({ ...agent, enabled })));
      ctx.emitChanged("agents");
    },
    "agents.setOrder": (keys: string[]) => {
      const rank = new Map(keys.map((key, index) => [key, index]));
      agents.sort((a, b) => (rank.get(a.key) ?? keys.length) - (rank.get(b.key) ?? keys.length));
    },
    "agents.addCustom": (input: CustomAgentInput) => {
      const path = input.skillsDir;
      // Windows accepts WSL folders (`\\wsl.localhost\…`) as absolute paths too.
      if (!path.startsWith("/") && !path.startsWith("~") && !isWslPath(path)) {
        ctx.fail("INVALID_INPUT", "Skills path must be absolute (or start with ~/).");
      }
      const created: AgentInfo = {
        key: input.displayName.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        displayName: input.displayName,
        category: "coding",
        installed: true,
        enabled: true,
        isCustom: true,
        skillsDir: input.skillsDir.replace(/^~/, HOME),
        hasPathOverride: false,
        projectSkillsDir: input.projectSkillsDir ?? null,
        hasProjectPathOverride: false,
        sharesDirWith: [],
        alsoReads: [],
        homeEnv: null,
        reload: null,
        detection: { reason: "custom", path: null },
      };
      agents.push(created);
      ctx.emitChanged("agents");
      return created;
    },
    "agents.removeCustom": (key: string) => {
      agents.splice(0, agents.length, ...agents.filter((agent) => agent.key !== key));
      ctx.emitChanged("agents");
    },
    "agents.setSkillsDir": (key: string, path: string) =>
      patchAgent(key, { skillsDir: path.replace(/^~/, HOME), hasPathOverride: true }),
    "agents.resetSkillsDir": (key: string) => patchAgent(key, { hasPathOverride: false }),
    "agents.setProjectSkillsDir": (key: string, path: string | null) =>
      patchAgent(key, { projectSkillsDir: path, hasProjectPathOverride: path !== null }),
    "agents.resetProjectSkillsDir": (key: string) =>
      patchAgent(key, { hasProjectPathOverride: false }),
  };
}
