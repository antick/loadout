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

export const BUILT_IN_AGENTS: readonly AgentDefinition[] = [
  {
    key: "cursor",
    displayName: "Cursor",
    skillsDir: ".cursor/skills",
    detectDir: ".cursor",
    extraScanDirs: [".agents/skills", ".claude/skills", ".codex/skills"],
    projectExtraScanDirs: [".agents/skills", ".claude/skills", ".codex/skills"],
  },
  {
    key: "claude_code",
    displayName: "Claude Code",
    skillsDir: ".claude/skills",
    detectDir: ".claude",
    homeEnv: { variable: "CLAUDE_CONFIG_DIR", skillsDir: "skills" },
    reload: { when: "live", command: "/reload-skills" },
  },
  {
    key: "omp_agent",
    displayName: "OMP Agent",
    skillsDir: ".omp/agent/skills",
    detectDir: ".omp/agent",
    projectSkillsDir: ".omp/skills",
  },
  {
    key: "codex",
    displayName: "Codex",
    skillsDir: ".codex/skills",
    detectDir: ".codex",
    projectSkillsDir: ".agents/skills",
    extraScanDirs: [".agents/skills"],
    homeEnv: { variable: "CODEX_HOME", skillsDir: "skills" },
    reload: { when: "live" },
  },
  {
    key: "grok",
    displayName: "Grok",
    skillsDir: ".grok/skills",
    detectDir: ".grok",
    extraScanDirs: [".agents/skills"],
  },
  {
    key: "opencode",
    displayName: "OpenCode",
    skillsDir: ".config/opencode/skills",
    detectDir: ".config/opencode",
    projectSkillsDir: ".opencode/skills",
    extraScanDirs: [".claude/skills", ".agents/skills"],
    projectExtraScanDirs: [".claude/skills", ".agents/skills"],
    reload: { when: "restart" },
  },
  {
    key: "antigravity",
    displayName: "Antigravity",
    skillsDir: ".gemini/antigravity/skills",
    detectDir: ".gemini/antigravity",
    projectSkillsDir: ".agents/skills",
    projectExtraScanDirs: [".agent/skills"],
  },
  {
    key: "amp",
    displayName: "Amp",
    skillsDir: ".config/agents/skills",
    detectDir: ".config/agents",
    projectSkillsDir: ".agents/skills",
    extraScanDirs: [".agents/skills", ".claude/skills"],
    projectExtraScanDirs: [".claude/skills"],
    reload: { when: "new_session", ask: "Reload my skills" },
  },
  {
    key: "kilo_code",
    displayName: "Kilo Code",
    skillsDir: ".kilocode/skills",
    detectDir: ".kilocode",
    extraScanDirs: [".agents/skills", ".claude/skills"],
    projectExtraScanDirs: [".agents/skills", ".claude/skills"],
    reload: { when: "new_session", command: "/reload" },
  },
  {
    key: "roo_code",
    displayName: "Roo Code",
    skillsDir: ".roo/skills",
    detectDir: ".roo",
    extraScanDirs: [".agents/skills"],
    projectExtraScanDirs: [".agents/skills"],
    reload: { when: "live" },
  },
  {
    key: "goose",
    displayName: "Goose",
    skillsDir: ".config/goose/skills",
    detectDir: ".config/goose",
    projectSkillsDir: ".goose/skills",
    extraScanDirs: [".agents/skills", ".claude/skills", ".config/agents/skills"],
    projectExtraScanDirs: [".agents/skills", ".claude/skills"],
    reload: { when: "new_session" },
  },
  {
    key: "gemini_cli",
    displayName: "Gemini CLI",
    skillsDir: ".gemini/skills",
    detectDir: ".gemini",
    extraScanDirs: [".agents/skills"],
    projectExtraScanDirs: [".agents/skills"],
    homeEnv: { variable: "GEMINI_CLI_HOME", skillsDir: ".gemini/skills", detectDir: ".gemini" },
    reload: { when: "new_session", command: "/skills reload" },
  },
  {
    key: "github_copilot",
    displayName: "GitHub Copilot",
    skillsDir: ".copilot/skills",
    detectDir: ".copilot",
    projectSkillsDir: ".github/skills",
    extraScanDirs: [".agents/skills"],
    projectExtraScanDirs: [".claude/skills", ".agents/skills"],
    homeEnv: { variable: "COPILOT_HOME", skillsDir: "skills" },
    reload: { when: "new_session", command: "/skills reload" },
  },
  {
    key: "openclaw",
    displayName: "OpenClaw",
    skillsDir: ".openclaw/skills",
    detectDir: ".openclaw",
    category: "assistant",
    homeEnv: { variable: "OPENCLAW_STATE_DIR", skillsDir: "skills" },
    reload: { when: "live" },
  },
  {
    key: "droid",
    displayName: "Droid",
    skillsDir: ".factory/skills",
    detectDir: ".factory",
    extraScanDirs: [".agents/skills", ".agent/skills"],
    projectExtraScanDirs: [".agents/skills", ".agent/skills"],
    reload: { when: "new_session" },
  },
  {
    key: "windsurf",
    displayName: "Windsurf",
    skillsDir: ".codeium/windsurf/skills",
    detectDir: ".codeium/windsurf",
    projectSkillsDir: ".windsurf/skills",
    extraScanDirs: [".agents/skills"],
    projectExtraScanDirs: [".devin/skills", ".agents/skills"],
  },
  { key: "trae", displayName: "TRAE IDE", skillsDir: ".trae/skills", detectDir: ".trae" },
  {
    key: "cline",
    displayName: "Cline",
    skillsDir: ".agents/skills",
    detectDir: ".cline",
    projectExtraScanDirs: [".cline/skills", ".clinerules/skills", ".claude/skills"],
  },
  {
    key: "deepagents",
    displayName: "Deep Agents",
    skillsDir: ".deepagents/agent/skills",
    detectDir: ".deepagents",
  },
  {
    key: "firebender",
    displayName: "Firebender",
    skillsDir: ".firebender/skills",
    detectDir: ".firebender",
  },
  {
    key: "kimi",
    displayName: "Kimi Code CLI",
    skillsDir: ".kimi-code/skills",
    detectDir: ".kimi-code",
  },
  {
    key: "replit",
    displayName: "Replit",
    skillsDir: ".config/agents/skills",
    detectDir: ".replit",
    projectSkillsDir: ".agents/skills",
  },
  {
    key: "warp",
    displayName: "Warp",
    skillsDir: ".agents/skills",
    detectDir: ".warp",
    extraScanDirs: [
      ".warp/skills",
      ".claude/skills",
      ".codex/skills",
      ".cursor/skills",
      ".gemini/skills",
      ".copilot/skills",
      ".factory/skills",
      ".github/skills",
      ".opencode/skills",
    ],
    projectExtraScanDirs: [
      ".warp/skills",
      ".claude/skills",
      ".codex/skills",
      ".cursor/skills",
      ".gemini/skills",
      ".copilot/skills",
      ".factory/skills",
      ".github/skills",
      ".opencode/skills",
    ],
    reload: { when: "new_session" },
  },
  { key: "augment", displayName: "Augment", skillsDir: ".augment/skills", detectDir: ".augment" },
  { key: "bob", displayName: "IBM Bob", skillsDir: ".bob/skills", detectDir: ".bob" },
  {
    key: "codebuddy",
    displayName: "CodeBuddy",
    skillsDir: ".codebuddy/skills",
    detectDir: ".codebuddy",
  },
  {
    key: "command_code",
    displayName: "Command Code",
    skillsDir: ".commandcode/skills",
    detectDir: ".commandcode",
  },
  {
    key: "continue",
    displayName: "Continue",
    skillsDir: ".continue/skills",
    detectDir: ".continue",
    projectExtraScanDirs: [".claude/skills"],
  },
  {
    key: "cortex",
    displayName: "Cortex Code",
    skillsDir: ".snowflake/cortex/skills",
    detectDir: ".snowflake/cortex",
  },
  {
    key: "crush",
    displayName: "Crush",
    skillsDir: ".config/crush/skills",
    detectDir: ".config/crush",
    projectSkillsDir: ".crush/skills",
    extraScanDirs: [".config/agents/skills", ".agents/skills", ".claude/skills"],
    projectExtraScanDirs: [".agents/skills", ".claude/skills", ".cursor/skills"],
  },
  { key: "iflow", displayName: "iFlow CLI", skillsDir: ".iflow/skills", detectDir: ".iflow" },
  {
    key: "junie",
    displayName: "Junie",
    skillsDir: ".junie/skills",
    detectDir: ".junie",
    extraScanDirs: [".agents/skills"],
    projectExtraScanDirs: [".agents/skills"],
  },
  { key: "kiro", displayName: "Kiro CLI", skillsDir: ".kiro/skills", detectDir: ".kiro" },
  { key: "kode", displayName: "Kode", skillsDir: ".kode/skills", detectDir: ".kode" },
  { key: "mcpjam", displayName: "MCPJam", skillsDir: ".mcpjam/skills", detectDir: ".mcpjam" },
  {
    key: "mistral_vibe",
    displayName: "Mistral Vibe",
    skillsDir: ".vibe/skills",
    detectDir: ".vibe",
    reload: { when: "restart", command: "/reload" },
  },
  { key: "mux", displayName: "Mux", skillsDir: ".mux/skills", detectDir: ".mux" },
  { key: "neovate", displayName: "Neovate", skillsDir: ".neovate/skills", detectDir: ".neovate" },
  {
    key: "openhands",
    displayName: "OpenHands",
    skillsDir: ".openhands/skills",
    detectDir: ".openhands",
    extraScanDirs: [".agents/skills"],
    projectExtraScanDirs: [".agents/skills"],
    reload: { when: "new_session" },
  },
  {
    key: "pi",
    displayName: "Pi",
    skillsDir: ".pi/agent/skills",
    detectDir: ".pi/agent",
    projectSkillsDir: ".pi/skills",
    extraScanDirs: [".agents/skills"],
    homeEnv: { variable: "PI_CODING_AGENT_DIR", skillsDir: "skills" },
    reload: { when: "new_session", command: "/reload" },
  },
  { key: "pochi", displayName: "Pochi", skillsDir: ".pochi/skills", detectDir: ".pochi" },
  { key: "qoder", displayName: "Qoder", skillsDir: ".qoder/skills", detectDir: ".qoder" },
  {
    key: "qwen_code",
    displayName: "Qwen Code",
    skillsDir: ".qwen/skills",
    detectDir: ".qwen",
    extraScanDirs: [".agents/skills"],
    projectExtraScanDirs: [".agents/skills"],
    homeEnv: { variable: "QWEN_HOME", skillsDir: "skills" },
    reload: { when: "live" },
  },
  { key: "trae_cn", displayName: "TRAE CN", skillsDir: ".trae-cn/skills", detectDir: ".trae-cn" },
  {
    key: "zencoder",
    displayName: "Zencoder",
    skillsDir: ".zencoder/skills",
    detectDir: ".zencoder",
  },
  { key: "zcode", displayName: "ZCode", skillsDir: ".zcode/skills", detectDir: ".zcode" },
  { key: "adal", displayName: "AdaL", skillsDir: ".adal/skills", detectDir: ".adal" },
  {
    key: "hermes",
    displayName: "Hermes Agent",
    skillsDir: ".hermes/skills",
    detectDir: ".hermes",
    recursiveScan: true,
    category: "assistant",
    homeEnv: { variable: "HERMES_HOME", skillsDir: "skills" },
    reload: { when: "new_session", command: "/reload-skills" },
  },
  {
    key: "qclaw",
    displayName: "QClaw",
    skillsDir: ".qclaw/skills",
    detectDir: ".qclaw",
    category: "assistant",
  },
  {
    key: "easyclaw",
    displayName: "EasyClaw",
    skillsDir: ".easyclaw/skills",
    detectDir: ".easyclaw",
    category: "assistant",
  },
  {
    key: "autoclaw",
    displayName: "AutoClaw",
    skillsDir: ".openclaw-autoclaw/skills",
    detectDir: ".openclaw-autoclaw",
    category: "assistant",
  },
  {
    key: "workbuddy",
    displayName: "WorkBuddy",
    skillsDir: ".workbuddy/skills",
    detectDir: ".workbuddy",
    category: "assistant",
  },
  {
    key: "deepseek_harness",
    displayName: "DeepSeek Harness",
    skillsDir: ".dsh/skills",
    detectDir: ".dsh",
    extraScanDirs: [".agents/skills"],
  },
  {
    key: "gitlab_duo",
    displayName: "GitLab Duo",
    skillsDir: ".gitlab/duo/skills",
    detectDir: ".gitlab/duo",
    projectSkillsDir: ".agents/skills",
    extraScanDirs: [".agents/skills"],
    reload: { when: "new_session" },
  },
];

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
