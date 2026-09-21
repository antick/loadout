import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  AGENT_PRIORITY_ORDER,
  type AgentCategory,
  type AgentDefinition,
  type AgentInfo,
  BUILT_IN_AGENTS,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { notFound } from "../errors";
import { osConfigDir } from "../paths";
import { INTERNAL_KEYS } from "../settings/store";
import { canonicalPath } from "../util/fs";

/** A user-defined agent, as stored in settings. */
export interface CustomAgentRecord {
  key: string;
  displayName: string;
  /** Absolute global skills folder. */
  skillsDir: string;
  /** Project-relative skills folder; null keeps the agent out of project workspaces. */
  projectSkillsDir: string | null;
}

/** An agent with every path resolved for this machine. */
export interface ResolvedAgent extends AgentInfo {
  /** Extra folders the agent reads that exist on this machine. Discovery only. */
  extraScanDirs: string[];
  recursiveScan: boolean;
}

const CONFIG_PREFIX = ".config/";

/**
 * Resolves built-in and custom agents against this machine: detection, path overrides, enabled
 * state and display order. Reads settings on every call, so it never goes stale.
 */
export class AgentRegistry {
  readonly #ctx: CoreContext;

  constructor(ctx: CoreContext) {
    this.#ctx = ctx;
  }

  /** `~/<relative>`, plus the OS config folder variant for `.config/…` paths. */
  #candidates(relative: string): string[] {
    const paths = [join(this.#ctx.homeDir, relative)];
    if (relative.startsWith(CONFIG_PREFIX)) {
      const alternative = join(
        osConfigDir(this.#ctx.homeDir),
        relative.slice(CONFIG_PREFIX.length),
      );
      if (!paths.includes(alternative)) paths.push(alternative);
    }
    return paths;
  }

  #firstExisting(relative: string): string {
    const candidates = this.#candidates(relative);
    return candidates.find((path) => existsSync(path)) ?? (candidates[0] as string);
  }

  customAgents(): CustomAgentRecord[] {
    const builtIn = new Set(BUILT_IN_AGENTS.map((a) => a.key));
    return this.#ctx.settings
      .getRaw<CustomAgentRecord[]>(INTERNAL_KEYS.customAgents, [])
      .filter((agent) => !builtIn.has(agent.key));
  }

  pathOverrides(): Record<string, string> {
    return this.#ctx.settings.getRaw<Record<string, string>>(INTERNAL_KEYS.agentPathOverrides, {});
  }

  projectPathOverrides(): Record<string, string> {
    return this.#ctx.settings.getRaw<Record<string, string>>(
      INTERNAL_KEYS.agentProjectPathOverrides,
      {},
    );
  }

  disabledKeys(): Set<string> {
    return new Set(this.#ctx.settings.getRaw<string[]>(INTERNAL_KEYS.disabledAgents, []));
  }

  #resolveBuiltIn(definition: AgentDefinition, disabled: ReadonlySet<string>): ResolvedAgent {
    const override = this.pathOverrides()[definition.key];
    const projectOverride = this.projectPathOverrides()[definition.key];
    const category: AgentCategory = definition.category ?? "coding";
    const detected = this.#candidates(definition.detectDir).some((path) => existsSync(path));
    const extraScanDirs = (definition.extraScanDirs ?? [])
      .flatMap((relative) => this.#candidates(relative))
      .filter((path, index, all) => existsSync(path) && all.indexOf(path) === index);
    return {
      key: definition.key,
      displayName: definition.displayName,
      category,
      installed: Boolean(override) || detected,
      enabled: !disabled.has(definition.key),
      isCustom: false,
      skillsDir: override ?? this.#firstExisting(definition.skillsDir),
      hasPathOverride: Boolean(override),
      projectSkillsDir: projectOverride ?? definition.projectSkillsDir ?? definition.skillsDir,
      hasProjectPathOverride: Boolean(projectOverride),
      sharesDirWith: [],
      extraScanDirs,
      recursiveScan: definition.recursiveScan ?? false,
    };
  }

  #resolveCustom(record: CustomAgentRecord, disabled: ReadonlySet<string>): ResolvedAgent {
    return {
      key: record.key,
      displayName: record.displayName,
      category: "coding",
      installed: true,
      enabled: !disabled.has(record.key),
      isCustom: true,
      skillsDir: record.skillsDir,
      hasPathOverride: false,
      projectSkillsDir: record.projectSkillsDir,
      hasProjectPathOverride: false,
      sharesDirWith: [],
      extraScanDirs: [],
      recursiveScan: false,
    };
  }

  /**
   * Saved order first; agents the user never placed are slotted next to their neighbour in the
   * priority list, so a newly supported agent appears where it belongs; the rest keep
   * registration order.
   */
  #order(keys: string[]): string[] {
    const known = new Set(keys);
    const saved = this.#ctx.settings.getRaw<string[]>(INTERNAL_KEYS.agentOrder, []);
    const ordered = [...new Set(saved.filter((key) => known.has(key)))];
    let anchor = -1;
    for (const key of AGENT_PRIORITY_ORDER) {
      if (!known.has(key)) continue;
      const at = ordered.indexOf(key);
      if (at !== -1) {
        anchor = at;
        continue;
      }
      ordered.splice(anchor + 1, 0, key);
      anchor += 1;
    }
    for (const key of keys) if (!ordered.includes(key)) ordered.push(key);
    return ordered;
  }

  /** Every agent, in display order. */
  list(): ResolvedAgent[] {
    const disabled = this.disabledKeys();
    const agents = [
      ...BUILT_IN_AGENTS.map((definition) => this.#resolveBuiltIn(definition, disabled)),
      ...this.customAgents().map((record) => this.#resolveCustom(record, disabled)),
    ];
    const byDir = new Map<string, string[]>();
    for (const agent of agents) {
      const dir = canonicalPath(agent.skillsDir);
      byDir.set(dir, [...(byDir.get(dir) ?? []), agent.key]);
    }
    for (const agent of agents) {
      const sharing = byDir.get(canonicalPath(agent.skillsDir)) ?? [];
      agent.sharesDirWith = sharing.filter((key) => key !== agent.key);
    }
    const byKey = new Map(agents.map((agent) => [agent.key, agent]));
    return this.#order(agents.map((a) => a.key)).map((key) => byKey.get(key) as ResolvedAgent);
  }

  find(key: string): ResolvedAgent | null {
    return this.list().find((agent) => agent.key === key) ?? null;
  }

  get(key: string): ResolvedAgent {
    const agent = this.find(key);
    if (!agent) throw notFound(`Unknown agent: ${key}`);
    return agent;
  }

  /** Installed and not switched off. */
  available(): ResolvedAgent[] {
    return this.list().filter((agent) => agent.installed && agent.enabled);
  }

  isBuiltIn(key: string): boolean {
    return BUILT_IN_AGENTS.some((agent) => agent.key === key);
  }

  toInfo(agent: ResolvedAgent): AgentInfo {
    const { extraScanDirs: _extra, recursiveScan: _recursive, ...info } = agent;
    return info;
  }
}
