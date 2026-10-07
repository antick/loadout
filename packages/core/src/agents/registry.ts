import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import {
  AGENT_PRIORITY_ORDER,
  type AgentCategory,
  type AgentDefinition,
  type AgentDetection,
  type AgentInfo,
  BUILT_IN_AGENTS,
  isAgentAvailable,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { notFound } from "../errors";
import { osConfigDir } from "../paths";
import { INTERNAL_KEYS } from "../settings/store";
import { canonicalPath, segmentsOf } from "../util/fs";

/**
 * An agent's home folder as its variable (`CODEX_HOME`, …) sets it: an absolute path (or `~/…`),
 * else null. A relative or empty value is ignored, as the agent itself would resolve it against
 * a folder we cannot know.
 */
export function agentHomeFromEnv(
  ctx: Pick<CoreContext, "env" | "homeDir">,
  variable: string,
): string | null {
  const raw = ctx.env()[variable]?.trim();
  if (!raw) return null;
  const home = ctx.homeDir;
  const value = raw === "~" ? home : raw.startsWith("~/") ? join(home, raw.slice(2)) : raw;
  return isAbsolute(value) ? value : null;
}

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
  /** Other project-relative folders the agent reads, `/` separated. Discovery only. */
  projectExtraScanDirs: string[];
  recursiveScan: boolean;
  /** The agent's plugin manager folder on this machine; null for agents without plugins. */
  pluginsDir: string | null;
}

const CONFIG_PREFIX = ".config/";

/** Settings every agent is resolved against, read once per `list`. */
interface ResolveSettings {
  disabled: ReadonlySet<string>;
  overrides: Record<string, string>;
  projectOverrides: Record<string, string>;
}

/**
 * `a\\b/./` → `a/b`: project-relative folders compare as `/` separated, with no trailing slash.
 * Null when nothing is left, or for a folder outside the project (never saved that way).
 */
export function relativeDir(dir: string | null | undefined): string | null {
  const segments = segmentsOf(dir ?? "").filter((segment) => segment !== ".");
  return segments.length > 0 && !segments.includes("..") ? segments.join("/") : null;
}

/**
 * Resolves built-in and custom agents against this machine: detection, path overrides, enabled
 * state and display order. Reads settings on every call, so it never goes stale.
 */
export class AgentRegistry {
  #resolved: { version: number; agents: ResolvedAgent[] } | null = null;
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

  /** A home-relative path on this machine, preferring the OS config folder variant that exists. */
  homePath(relative: string): string {
    return this.#firstExisting(relative);
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

  #homeFromEnv(definition: AgentDefinition): { variable: string; value: string } | null {
    const variable = definition.homeEnv?.variable;
    const value = variable ? agentHomeFromEnv(this.#ctx, variable) : null;
    return variable && value ? { variable, value } : null;
  }

  #resolveBuiltIn(definition: AgentDefinition, settings: ResolveSettings): ResolvedAgent {
    const override = settings.overrides[definition.key];
    const projectOverride = settings.projectOverrides[definition.key];
    const { disabled } = settings;
    const category: AgentCategory = definition.category ?? "coding";
    const envHome = this.#homeFromEnv(definition);
    const homeEnv = definition.homeEnv;
    const detectCandidates =
      envHome && homeEnv
        ? [join(envHome.value, homeEnv.detectDir ?? "")]
        : this.#candidates(definition.detectDir);
    const found = detectCandidates.find((path) => existsSync(path)) ?? null;
    const detected = found !== null;
    const detection: AgentDetection = found
      ? { reason: "folder", path: found }
      : override
        ? { reason: "override", path: null }
        : { reason: "missing", path: detectCandidates[0] ?? null };
    const defaultSkillsDir =
      envHome && homeEnv
        ? join(envHome.value, homeEnv.skillsDir)
        : this.#firstExisting(definition.skillsDir);
    return {
      key: definition.key,
      displayName: definition.displayName,
      category,
      installed: Boolean(override) || detected,
      enabled: !disabled.has(definition.key),
      isCustom: false,
      skillsDir: override ?? defaultSkillsDir,
      hasPathOverride: Boolean(override),
      projectSkillsDir: relativeDir(
        projectOverride ?? definition.projectSkillsDir ?? definition.skillsDir,
      ),
      hasProjectPathOverride: Boolean(projectOverride),
      sharesDirWith: [],
      // Extra folders the agent reads that exist on this machine. Discovery only.
      alsoReads: (definition.extraScanDirs ?? [])
        .flatMap((relative) => this.#candidates(relative))
        .filter((path, index, all) => existsSync(path) && all.indexOf(path) === index),
      homeEnv: override ? null : envHome,
      reload: definition.reload ?? null,
      detection,
      projectExtraScanDirs: (definition.projectExtraScanDirs ?? []).flatMap(
        (dir) => relativeDir(dir) ?? [],
      ),
      recursiveScan: definition.recursiveScan ?? false,
      pluginsDir: found && definition.pluginsDir ? join(found, definition.pluginsDir) : null,
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
      projectSkillsDir: relativeDir(record.projectSkillsDir),
      hasProjectPathOverride: false,
      sharesDirWith: [],
      alsoReads: [],
      homeEnv: null,
      reload: null,
      detection: { reason: "custom", path: null },
      projectExtraScanDirs: [],
      recursiveScan: false,
      pluginsDir: null,
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

  /**
   * Every agent, in display order. Resolving touches the disk for each of them, so one answer is
   * kept for the rest of the current turn of the event loop, while the settings stay as they
   * were: an API call that looks up several agents resolves them once.
   */
  list(): ResolvedAgent[] {
    const version = this.#ctx.settings.version;
    if (this.#resolved?.version === version) return [...this.#resolved.agents];
    const agents = this.#resolveAll();
    this.#resolved = { version, agents };
    setImmediate(() => {
      this.#resolved = null;
    });
    return [...agents];
  }

  #resolveAll(): ResolvedAgent[] {
    const settings: ResolveSettings = {
      disabled: this.disabledKeys(),
      overrides: this.pathOverrides(),
      projectOverrides: this.projectPathOverrides(),
    };
    const agents = [
      ...BUILT_IN_AGENTS.map((definition) => this.#resolveBuiltIn(definition, settings)),
      ...this.customAgents().map((record) => this.#resolveCustom(record, settings.disabled)),
    ];
    const dirs = new Map(agents.map((agent) => [agent.key, canonicalPath(agent.skillsDir)]));
    const byDir = new Map<string, string[]>();
    for (const agent of agents) {
      const dir = dirs.get(agent.key) as string;
      byDir.set(dir, [...(byDir.get(dir) ?? []), agent.key]);
    }
    for (const agent of agents) {
      const sharing = byDir.get(dirs.get(agent.key) as string) ?? [];
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
    return this.list().filter(isAgentAvailable);
  }

  toInfo(agent: ResolvedAgent): AgentInfo {
    const { projectExtraScanDirs: _projectExtra, recursiveScan: _recursive, ...info } = agent;
    return info;
  }
}
