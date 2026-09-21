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
  /** Extra folders (relative to home) the agent also reads. Discovery only, never a deploy target. */
  extraScanDirs?: string[];
  /** Skills live in nested category folders, so scan until a skill folder is found. */
  recursiveScan?: boolean;
  /** Defaults to "coding". */
  category?: AgentCategory;
}

export const BUILT_IN_AGENTS: readonly AgentDefinition[] = [
  { key: "cursor", displayName: "Cursor", skillsDir: ".cursor/skills", detectDir: ".cursor" },
  {
    key: "claude_code",
    displayName: "Claude Code",
    skillsDir: ".claude/skills",
    detectDir: ".claude",
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
    extraScanDirs: [".agents/skills"],
  },
  { key: "grok", displayName: "Grok", skillsDir: ".grok/skills", detectDir: ".grok" },
  {
    key: "opencode",
    displayName: "OpenCode",
    skillsDir: ".config/opencode/skills",
    detectDir: ".config/opencode",
    projectSkillsDir: ".opencode/skills",
  },
  {
    key: "antigravity",
    displayName: "Antigravity",
    skillsDir: ".gemini/antigravity/skills",
    detectDir: ".gemini/antigravity",
  },
  {
    key: "amp",
    displayName: "Amp",
    skillsDir: ".config/agents/skills",
    detectDir: ".config/agents",
  },
  {
    key: "kilo_code",
    displayName: "Kilo Code",
    skillsDir: ".kilocode/skills",
    detectDir: ".kilocode",
  },
  { key: "roo_code", displayName: "Roo Code", skillsDir: ".roo/skills", detectDir: ".roo" },
  {
    key: "goose",
    displayName: "Goose",
    skillsDir: ".config/goose/skills",
    detectDir: ".config/goose",
  },
  {
    key: "gemini_cli",
    displayName: "Gemini CLI",
    skillsDir: ".gemini/skills",
    detectDir: ".gemini",
  },
  {
    key: "github_copilot",
    displayName: "GitHub Copilot",
    skillsDir: ".copilot/skills",
    detectDir: ".copilot",
    extraScanDirs: [".agents/skills"],
  },
  {
    key: "openclaw",
    displayName: "OpenClaw",
    skillsDir: ".openclaw/skills",
    detectDir: ".openclaw",
    category: "assistant",
  },
  { key: "droid", displayName: "Droid", skillsDir: ".factory/skills", detectDir: ".factory" },
  {
    key: "windsurf",
    displayName: "Windsurf",
    skillsDir: ".codeium/windsurf/skills",
    detectDir: ".codeium/windsurf",
  },
  { key: "trae", displayName: "TRAE IDE", skillsDir: ".trae/skills", detectDir: ".trae" },
  { key: "cline", displayName: "Cline", skillsDir: ".agents/skills", detectDir: ".cline" },
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
  },
  { key: "warp", displayName: "Warp", skillsDir: ".agents/skills", detectDir: ".warp" },
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
  },
  { key: "iflow", displayName: "iFlow CLI", skillsDir: ".iflow/skills", detectDir: ".iflow" },
  { key: "junie", displayName: "Junie", skillsDir: ".junie/skills", detectDir: ".junie" },
  { key: "kiro", displayName: "Kiro CLI", skillsDir: ".kiro/skills", detectDir: ".kiro" },
  { key: "kode", displayName: "Kode", skillsDir: ".kode/skills", detectDir: ".kode" },
  { key: "mcpjam", displayName: "MCPJam", skillsDir: ".mcpjam/skills", detectDir: ".mcpjam" },
  {
    key: "mistral_vibe",
    displayName: "Mistral Vibe",
    skillsDir: ".vibe/skills",
    detectDir: ".vibe",
  },
  { key: "mux", displayName: "Mux", skillsDir: ".mux/skills", detectDir: ".mux" },
  { key: "neovate", displayName: "Neovate", skillsDir: ".neovate/skills", detectDir: ".neovate" },
  {
    key: "openhands",
    displayName: "OpenHands",
    skillsDir: ".openhands/skills",
    detectDir: ".openhands",
  },
  {
    key: "pi",
    displayName: "Pi",
    skillsDir: ".pi/agent/skills",
    detectDir: ".pi/agent",
    projectSkillsDir: ".pi/skills",
    extraScanDirs: [".agents/skills"],
  },
  { key: "pochi", displayName: "Pochi", skillsDir: ".pochi/skills", detectDir: ".pochi" },
  { key: "qoder", displayName: "Qoder", skillsDir: ".qoder/skills", detectDir: ".qoder" },
  { key: "qwen_code", displayName: "Qwen Code", skillsDir: ".qwen/skills", detectDir: ".qwen" },
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
