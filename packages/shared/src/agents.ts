import { FIRST_AGENTS } from "./agents-table";
import { MORE_AGENTS } from "./agents-table-more";

/** UI grouping only. Assistant agents are personal-assistant style tools rather than coding tools. */
export type AgentCategory = "coding" | "assistant";

/** Static description of an agent Loadout knows how to deploy skills to. */
export interface AgentDefinition {
  key: string;
  displayName: string;
  /** Global skills folder, relative to the home directory. The deploy target. */
  skillsDir: string;
  /** Folder, relative to home, whose existence means the agent is installed. */
  detectDir: string;
  /** Project-relative skills folder. Defaults to `skillsDir` when omitted. */
  projectSkillsDir?: string;
  /**
   * Other global folders (relative to home) the agent also loads skills from, per its docs.
   * Discovery and "loaded twice" only, never a deploy target.
   */
  extraScanDirs?: string[];
  /** Other project-relative folders the agent also loads skills from. Same use as above. */
  projectExtraScanDirs?: string[];
  /** Skills live in nested category folders, so scan until a skill folder is found. */
  recursiveScan?: boolean;
  /** Defaults to "coding". */
  category?: AgentCategory;
  /**
   * An environment variable the agent documents for moving its home folder. When it is set to an
   * absolute path, `skillsDir` and `detectDir` are read inside that folder instead of home.
   */
  homeEnv?: AgentHomeEnv;
  /**
   * When the agent sees added, changed or removed skills, per its own documentation or source
   * (checked September 2026). Left out when neither says: the app then says nothing.
   */
  reload?: AgentReload;
  /**
   * Folder of the agent's plugin manager, relative to the folder `detectDir` found (or its home
   * folder variable). Plugins bring skills of their own, which the agent loads next to these.
   */
  pluginsDir?: string;
}

/**
 * `live`: the running agent notices changes by itself. `new_session`: a new chat or session
 * sees them. `restart`: the program must be restarted.
 */
export type AgentReloadWhen = "live" | "new_session" | "restart";

export interface AgentReload {
  when: AgentReloadWhen;
  /** Typed in a running session to load changed skills without waiting. */
  command?: string;
  /** Said to the agent in a running session, for agents that reload on request. */
  ask?: string;
}

/** Where an agent's folders are when its home folder variable is set. */
export interface AgentHomeEnv {
  variable: string;
  /** Skills folder, relative to the variable's folder. */
  skillsDir: string;
  /** Folder whose existence means the agent is installed, relative to it. Defaults to the folder itself. */
  detectDir?: string;
}

/** Every agent Loadout knows how to deploy skills to. */
export const BUILT_IN_AGENTS: readonly AgentDefinition[] = [...FIRST_AGENTS, ...MORE_AGENTS];

/** Order agents appear in until the user drags them into their own order. */
export const AGENT_PRIORITY_ORDER: readonly string[] = [
  "claude_code",
  "codex",
  "cursor",
  "github_copilot",
  "gemini_cli",
  "opencode",
  "openclaw",
  "hermes",
  "openhands",
  "cline",
  "goose",
  "windsurf",
  "continue",
  "grok",
  "antigravity",
  "qwen_code",
  "crush",
  "kilo_code",
  "roo_code",
  "deepagents",
  "amp",
  "kiro",
  "omp_agent",
];

/** Agents pre-selected first when exporting a skill to a project. */
export const PROJECT_EXPORT_PRIORITY: readonly string[] = [
  "claude_code",
  "codex",
  "cursor",
  "gemini_cli",
  "github_copilot",
];

/** Every home folder variable a built-in agent reads, for hosts that must look them up. */
export const AGENT_HOME_ENV_VARIABLES: readonly string[] = BUILT_IN_AGENTS.flatMap((agent) =>
  agent.homeEnv ? [agent.homeEnv.variable] : [],
);

const AGENT_KEY_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

/** Agent keys from a file that may come from another device: unusable ones and repeats dropped. */
export function cleanAgentKeys(values: readonly unknown[]): string[] {
  const keys = values.filter(
    (value): value is string => typeof value === "string" && AGENT_KEY_PATTERN.test(value),
  );
  return [...new Set(keys)].sort();
}

/** An agent (or project target) skills can go to now: found on this machine and not switched off. */
export function isAgentAvailable(agent: { installed: boolean; enabled: boolean }): boolean {
  return agent.installed && agent.enabled;
}
