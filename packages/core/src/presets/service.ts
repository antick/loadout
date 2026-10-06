import type {
  ApplyResult,
  Preset,
  PresetRemoveOptions,
  PresetAgentToggle,
  PresetInput,
  PresetsApi,
} from "@loadout/shared";
import type { AgentRegistry } from "../agents/registry";
import type { CoreContext } from "../context";
import type { DeployService, PairRef } from "../deploy";
import { errorMessage, exists, invalid } from "../errors";
import type { PortableMetadata } from "../skills/portable";
import type { SkillStore } from "../skills/store";
import { type PresetFields, PresetStore } from "./store";

export interface PresetsServiceDeps {
  store: SkillStore;
  registry: AgentRegistry;
  deploy: Pick<DeployService, "applyPairs">;
  portable: Pick<PortableMetadata, "forgetPreset">;
}

/** Everything but sharing, which needs the installers (`share.ts`, wired in `core.ts`). */
export type PresetsCoreApi = Omit<PresetsApi, "exportFile" | "previewImport" | "importFile">;

export interface PresetsService {
  api: PresetsCoreApi;
  presets: PresetStore;
}

const trimmedOrNull = (value: string | null | undefined): string | null => value?.trim() || null;

function requireMember(preset: Preset, skillId: string): void {
  if (!preset.skillIds.includes(skillId)) throw invalid("Skill is not in this preset");
}

const pairKey = (skillId: string, agentKey: string): string => `${skillId}\u0000${agentKey}`;

function describeApply(result: ApplyResult, action: "add" | "remove"): string {
  const parts =
    action === "add"
      ? [`${result.added} deployed`, `${result.skipped} already in place`]
      : [`${result.removed} removed`, `${result.skipped} not deployed`];
  if (result.conflicts.length > 0) parts.push(`${result.conflicts.length} refused`);
  if (result.failed.length > 0) parts.push(`${result.failed.length} failed`);
  return parts.join(", ");
}

/**
 * Presets are named sets of skills plus a per-skill per-agent switch. Editing one never touches
 * an agent's folder: only `applyToDefault` does, and that is a one-time deploy, not a live sync.
 */
export function createPresetsService(ctx: CoreContext, deps: PresetsServiceDeps): PresetsService {
  const { store, registry, deploy, portable } = deps;
  const presets = new PresetStore(ctx.db);

  /**
   * Every edit runs under the library lock, like tag edits: a re-index or a merge in another
   * process must see the presets either before or after it, never halfway.
   */
  async function edit<T>(operation: string, fn: () => T): Promise<T> {
    const result = await ctx.lock.run(operation, fn);
    ctx.touched("presets", "skills");
    return result;
  }

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

  /**
   * Preset skills × available agents (only `agentKeys` when given), minus the pairs switched
   * off. Preset order is kept.
   */
  function wantedPairs(preset: Preset, agentKeys?: readonly string[]): PairRef[] {
    const agents = registry
      .available()
      .filter((agent) => agentKeys === undefined || agentKeys.includes(agent.key));
    return preset.skillIds.flatMap((skillId) => {
      const off = presets.disabledAgents(preset.id, skillId);
      return agents
        .filter((agent) => !off.has(agent.key))
        .map((agent) => ({ skillId, agentKey: agent.key }));
    });
  }

  /**
   * Preset skills × the agents to take them out of: `agentKeys` when given, else every agent
   * that currently holds one of the skills. Switches are not consulted.
   */
  function heldPairs(preset: Preset, agentKeys?: readonly string[]): PairRef[] {
    const keys = agentKeys ?? [
      ...new Set(
        store
          .deployments()
          .filter((d) => preset.skillIds.includes(d.skillId))
          .map((d) => d.agentKey),
      ),
    ];
    return preset.skillIds.flatMap((skillId) => keys.map((agentKey) => ({ skillId, agentKey })));
  }

  /**
   * Deploy or remove the preset's wanted pairs and record the outcome in the activity log. A dry
   * run changes nothing, so it leaves no entry.
   */
  async function applyWanted(
    preset: Preset,
    action: "add" | "remove",
    options: PresetRemoveOptions = {},
  ): Promise<ApplyResult> {
    const { agentKeys, everyHolder, ...applyOptions } = options;
    const record = (detail: string, ok: boolean): void => {
      if (!applyOptions.dryRun) ctx.activity.record("preset", preset.name, detail, ok);
    };
    const held = action === "remove" && (agentKeys !== undefined || everyHolder === true);
    const pairs = held ? heldPairs(preset, agentKeys) : wantedPairs(preset, agentKeys);
    try {
      const result = await deploy.applyPairs(pairs, action, applyOptions);
      const clean = result.conflicts.length === 0 && result.failed.length === 0;
      record(describeApply(result, action), clean);
      return result;
    } catch (error) {
      record(errorMessage(error), false);
      throw error;
    }
  }

  const api: PresetsCoreApi = {
    list: async () => presets.list(),

    create: async (input) => edit("create a preset", () => presets.insert(cleanInput(input, null))),

    update: async (id, input) =>
      edit(`edit the preset ${presets.get(id).name}`, () =>
        presets.update(id, cleanInput(input, id)),
      ),

    remove: async (id) =>
      edit(`delete the preset ${presets.get(id).name}`, () => {
        presets.delete(id);
        portable.forgetPreset(id);
      }),

    reorder: async (ids) => edit("reorder presets", () => presets.reorder(ids)),

    addSkills: async (id, skillIds) =>
      edit(`add skills to the preset ${presets.get(id).name}`, () => {
        // Check every skill before writing, so a bad id does not leave half the list added.
        for (const skillId of skillIds) store.get(skillId);
        presets.addSkills(id, skillIds);
      }),

    removeSkills: async (id, skillIds) =>
      edit(`remove skills from the preset ${presets.get(id).name}`, () =>
        presets.removeSkills(id, skillIds),
      ),

    reorderSkills: async (id, skillIds) =>
      edit(`reorder the preset ${presets.get(id).name}`, () => presets.reorderSkills(id, skillIds)),

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
      const preset = presets.get(id);
      requireMember(preset, skillId);
      const agent = registry.get(agentKey);
      if (enabled && !agent.installed) throw invalid(`${agent.displayName} is not installed`);
      if (enabled && !agent.enabled) throw invalid(`${agent.displayName} is disabled`);
      await edit(`switch ${agent.displayName} in the preset ${preset.name}`, () =>
        presets.setToggle(id, skillId, agentKey, enabled),
      );
    },

    applyToDefault: async (id, options) => applyWanted(presets.get(id), "add", options),

    removeFromDefault: async (id, options) => applyWanted(presets.get(id), "remove", options),

    deployStatus: async () => {
      const deployed = new Set(store.deployments().map((d) => pairKey(d.skillId, d.agentKey)));
      return presets.list().map((preset) => {
        const wanted = wantedPairs(preset);
        return {
          presetId: preset.id,
          deployed: wanted.filter((pair) => deployed.has(pairKey(pair.skillId, pair.agentKey)))
            .length,
          total: wanted.length,
        };
      });
    },
  };

  return { api, presets };
}
