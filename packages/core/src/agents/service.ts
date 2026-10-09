import { posix, win32 } from "node:path";
import { APP_NAME, type AgentsApi, BUILT_IN_AGENTS, type CustomAgentInput } from "@loadout/shared";
import type { CoreContext } from "../context";
import type { DeployService } from "../deploy";
import { invalid } from "../errors";
import { INTERNAL_KEYS } from "../settings/store";
import {
  canonicalPath,
  normalizeAbsolutePath,
  pathsOverlap,
  realPathOf,
  segmentsOf,
} from "../util/fs";
import { agentKeyFromName } from "../util/names";
import {
  type AgentRegistry,
  type CustomAgentRecord,
  type ResolvedAgent,
  relativeDir,
} from "./registry";
import { logRedeployProblems } from "../deploy/report-log";
import type { SkillStore } from "../skills/store";

export interface AgentsServiceDeps {
  registry: AgentRegistry;
  deploy: Pick<DeployService, "removeAllForAgent" | "moveAgentDeployments">;
  store: Pick<SkillStore, "deploymentsForAgent" | "nameOf">;
}

export interface AgentsService {
  api: AgentsApi;
}

const SKILLS_PATH_LABEL = "Skills path";
const HOME_SHORTHAND = "~";

/**
 * A project skills folder as typed by the user: null when empty, otherwise a clean
 * `/`-separated path that cannot leave the project.
 */
export function normalizeProjectDir(input: string | null | undefined): string | null {
  const raw = input?.trim() ?? "";
  if (!raw) return null;
  if (raw.startsWith(HOME_SHORTHAND) || posix.isAbsolute(raw) || win32.isAbsolute(raw)) {
    throw invalid("Project skills path must be relative to the project root");
  }
  if (segmentsOf(raw).includes("..")) {
    throw invalid("Project skills path cannot contain parent directory segments");
  }
  return relativeDir(raw);
}

function requireBuiltIn(agent: ResolvedAgent, what: string): void {
  if (agent.isCustom) {
    throw invalid(`${agent.displayName} is a custom agent, so it has no default ${what}`);
  }
}

function defaultProjectDir(key: string): string | null {
  const definition = BUILT_IN_AGENTS.find((agent) => agent.key === key);
  return definition
    ? normalizeProjectDir(definition.projectSkillsDir ?? definition.skillsDir)
    : null;
}

/**
 * An agent's skills folder as typed by the user, refused when it is, holds or lies inside the
 * library: the library's own folders would show up there as the agent's unmanaged skills.
 */
function agentSkillsDir(ctx: CoreContext, input: string | null | undefined): string {
  const skillsDir = normalizeAbsolutePath(input ?? "", SKILLS_PATH_LABEL);
  if (pathsOverlap(realPathOf(skillsDir), realPathOf(ctx.paths.baseDir))) {
    throw invalid(
      `${SKILLS_PATH_LABEL} ${skillsDir} overlaps the ${APP_NAME} library (${ctx.paths.baseDir}): pick another folder.`,
    );
  }
  return skillsDir;
}

export function createAgentsService(ctx: CoreContext, deps: AgentsServiceDeps): AgentsService {
  const { registry, deploy, store } = deps;

  /** Names of the skills deployed to an agent: what switching it off takes away. */
  const deployedNames = (key: string): string[] =>
    store
      .deploymentsForAgent(key)
      .map((row) => store.nameOf(row.skillId) ?? row.skillId)
      .sort((a, b) => a.localeCompare(b));
  const { settings } = ctx;

  const changed = (): void => ctx.touched("agents", "skills");

  function saveCustom(records: CustomAgentRecord[]): void {
    settings.setRaw(INTERNAL_KEYS.customAgents, records);
  }

  function patchCustom(key: string, patch: Partial<CustomAgentRecord>): void {
    const records = registry.customAgents();
    const record = records.find((candidate) => candidate.key === key);
    if (record) Object.assign(record, patch);
    saveCustom(records);
  }

  /** Set, or with `null` delete, one agent's entry in a `{ key: path }` settings blob. */
  function writeOverride(blobKey: string, agentKey: string, value: string | null): void {
    const { [agentKey]: _previous, ...rest } = settings.getRaw<Record<string, string>>(blobKey, {});
    settings.setRaw(blobKey, value === null ? rest : { ...rest, [agentKey]: value });
  }

  function saveDisabled(keys: Iterable<string>): void {
    settings.setRaw(INTERNAL_KEYS.disabledAgents, [...new Set(keys)]);
  }

  /** Deployments follow the agent whenever its resolved global folder really changed. */
  async function followSkillsDir(before: ResolvedAgent): Promise<void> {
    const after = registry.get(before.key);
    if (canonicalPath(before.skillsDir) === canonicalPath(after.skillsDir)) return;
    const report = await deploy.moveAgentDeployments(before.key, before.skillsDir, after.skillsDir);
    logRedeployProblems(ctx.log, report, "move");
  }

  const api: AgentsApi = {
    list: async () => registry.list().map((agent) => registry.toInfo(agent)),

    setEnabled: async (key, enabled, options = {}) => {
      const agent = registry.get(key);
      // Already off, nothing is deployed there to take away.
      const removed = !enabled && agent.enabled ? deployedNames(key) : [];
      if (options.dryRun) return { removed };
      const disabled = registry.disabledKeys();
      if (enabled) {
        disabled.delete(key);
      } else {
        await deploy.removeAllForAgent(key);
        disabled.add(key);
      }
      saveDisabled(disabled);
      changed();
      return { removed };
    },

    setAllEnabled: async (enabled) => {
      if (enabled) {
        saveDisabled([]);
      } else {
        const keys = registry.list().map((agent) => agent.key);
        for (const key of keys) await deploy.removeAllForAgent(key);
        saveDisabled(keys);
      }
      changed();
    },

    setOrder: async (keys) => {
      if (!Array.isArray(keys) || keys.some((key) => typeof key !== "string")) {
        throw invalid("Agent order must be a list of agent keys");
      }
      settings.setRaw(INTERNAL_KEYS.agentOrder, keys);
      changed();
    },

    addCustom: async (input: CustomAgentInput) => {
      const displayName = input.displayName?.trim() ?? "";
      if (!displayName) throw invalid("Agent name and skills path are required");
      const skillsDir = agentSkillsDir(ctx, input.skillsDir);
      const projectSkillsDir = normalizeProjectDir(input.projectSkillsDir);
      const taken = new Set(registry.list().map((agent) => agent.key));
      const key = agentKeyFromName(displayName, taken);
      saveCustom([...registry.customAgents(), { key, displayName, skillsDir, projectSkillsDir }]);
      changed();
      return registry.toInfo(registry.get(key));
    },

    removeCustom: async (key) => {
      const agent = registry.get(key);
      if (!agent.isCustom) throw invalid(`${agent.displayName} is built in and cannot be removed`);
      await deploy.removeAllForAgent(key);
      saveCustom(registry.customAgents().filter((record) => record.key !== key));
      writeOverride(INTERNAL_KEYS.agentPathOverrides, key, null);
      writeOverride(INTERNAL_KEYS.agentProjectPathOverrides, key, null);
      const disabled = registry.disabledKeys();
      disabled.delete(key);
      saveDisabled(disabled);
      const order = settings.getRaw<string[]>(INTERNAL_KEYS.agentOrder, []);
      settings.setRaw(
        INTERNAL_KEYS.agentOrder,
        order.filter((entry) => entry !== key),
      );
      changed();
    },

    setSkillsDir: async (key, path) => {
      const before = registry.get(key);
      const skillsDir = agentSkillsDir(ctx, path);
      if (before.isCustom) patchCustom(key, { skillsDir });
      else writeOverride(INTERNAL_KEYS.agentPathOverrides, key, skillsDir);
      await followSkillsDir(before);
      changed();
    },

    resetSkillsDir: async (key) => {
      const before = registry.get(key);
      requireBuiltIn(before, "skills path");
      writeOverride(INTERNAL_KEYS.agentPathOverrides, key, null);
      await followSkillsDir(before);
      changed();
    },

    setProjectSkillsDir: async (key, relativePath) => {
      const agent = registry.get(key);
      const projectSkillsDir = normalizeProjectDir(relativePath);
      if (agent.isCustom) {
        patchCustom(key, { projectSkillsDir });
      } else {
        const isDefault = projectSkillsDir === defaultProjectDir(key);
        writeOverride(
          INTERNAL_KEYS.agentProjectPathOverrides,
          key,
          isDefault ? null : projectSkillsDir,
        );
      }
      changed();
    },

    resetProjectSkillsDir: async (key) => {
      requireBuiltIn(registry.get(key), "project skills path");
      writeOverride(INTERNAL_KEYS.agentProjectPathOverrides, key, null);
      changed();
    },
  };

  return { api };
}
