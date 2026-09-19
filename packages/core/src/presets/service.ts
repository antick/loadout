import type {
  ApplyResult,
  Preset,
  PresetAgentToggle,
  PresetInput,
  PresetsApi,
} from "@skillboard/shared";
import type { AgentRegistry } from "../agents/registry";
import type { CoreContext } from "../context";
import type { DeployService, PairRef } from "../deploy";
import { errorMessage, exists, invalid } from "../errors";
import type { SkillStore } from "../skills/store";
import { type PresetFields, PresetStore } from "./store";

export interface PresetsServiceDeps {
  store: SkillStore;
  registry: AgentRegistry;
  deploy: Pick<DeployService, "applyPairs">;
}

export interface PresetsService {
  api: PresetsApi;
  presets: PresetStore;
}

const trimmedOrNull = (value: string | null | undefined): string | null => value?.trim() || null;

function requireMember(preset: Preset, skillId: string): void {
  if (!preset.skillIds.includes(skillId)) throw invalid("Skill is not in this preset");
}

function describeApply(result: ApplyResult): string {
  const parts = [`${result.added} deployed`, `${result.skipped} already in place`];
  if (result.conflicts.length > 0) parts.push(`${result.conflicts.length} refused`);
  if (result.failed.length > 0) parts.push(`${result.failed.length} failed`);
  return parts.join(", ");
}

/**
 * Presets are named sets of skills plus a per-skill per-agent switch. Editing one never touches
 * an agent's folder: only `applyToDefault` does, and that is a one-time deploy, not a live sync.
 */
export function createPresetsService(ctx: CoreContext, deps: PresetsServiceDeps): PresetsService {
  const { store, registry, deploy } = deps;
  const presets = new PresetStore(ctx.db);

  const changed = (): void => ctx.touched("presets", "skills");

  function cleanInput(input: PresetInput, selfId: string | null): PresetFields {
    const name = input.name.trim();
    if (!name) throw invalid("Preset name cannot be empty");
    const holder = presets.findByName(name);
    if (holder && holder.id !== selfId) throw exists(`A preset called "${name}" already exists`);
    return {
      name,
      description: trimmedOrNull(input.description),
      icon: trimmedOrNull(input.icon),
    };
  }

  /** Preset skills × available agents, minus the pairs switched off. Preset order is kept. */
  function wantedPairs(preset: Preset): PairRef[] {
    const agents = registry.available();
    return preset.skillIds.flatMap((skillId) => {
      const off = presets.disabledAgents(preset.id, skillId);
      return agents
        .filter((agent) => !off.has(agent.key))
        .map((agent) => ({ skillId, agentKey: agent.key }));
    });
  }

  const api: PresetsApi = {
    list: async () => presets.list(),

    create: async (input) => {
      const preset = presets.insert(cleanInput(input, null));
      changed();
      return preset;
    },

    update: async (id, input) => {
      presets.get(id);
      const preset = presets.update(id, cleanInput(input, id));
      changed();
      return preset;
    },

    remove: async (id) => {
      presets.get(id);
      presets.delete(id);
      changed();
    },

    reorder: async (ids) => {
      presets.reorder(ids);
      changed();
    },

    addSkills: async (id, skillIds) => {
      presets.get(id);
      // Check every skill before writing, so a bad id does not leave half the list added.
      for (const skillId of skillIds) store.get(skillId);
      presets.addSkills(id, skillIds);
      changed();
    },

    removeSkills: async (id, skillIds) => {
      presets.get(id);
      presets.removeSkills(id, skillIds);
      changed();
    },

    reorderSkills: async (id, skillIds) => {
      presets.get(id);
      presets.reorderSkills(id, skillIds);
      changed();
    },

    toggles: async (id, skillId): Promise<PresetAgentToggle[]> => {
      requireMember(presets.get(id), skillId);
      const off = presets.disabledAgents(id, skillId);
      return registry.list().map((agent) => ({
        agentKey: agent.key,
        displayName: agent.displayName,
        installed: agent.installed,
        globallyEnabled: agent.enabled,
        // An agent that cannot receive skills is shown as off whatever was saved for it.
        enabled: agent.installed && agent.enabled && !off.has(agent.key),
      }));
    },

    setToggle: async (id, skillId, agentKey, enabled) => {
      requireMember(presets.get(id), skillId);
      const agent = registry.get(agentKey);
      if (enabled && !agent.installed) throw invalid(`${agent.displayName} is not installed`);
      if (enabled && !agent.enabled) throw invalid(`${agent.displayName} is disabled`);
      presets.setToggle(id, skillId, agentKey, enabled);
      changed();
    },

    applyToDefault: async (id) => {
      const preset = presets.get(id);
      try {
        const result = await deploy.applyPairs(wantedPairs(preset), "add");
        const clean = result.conflicts.length === 0 && result.failed.length === 0;
        ctx.activity.record("preset", preset.name, describeApply(result), clean);
        return result;
      } catch (error) {
        ctx.activity.record("preset", preset.name, errorMessage(error), false);
        throw error;
      }
    },
  };

  return { api, presets };
}
