/**
 * Instruction files: the Markdown an agent reads before every session (`CLAUDE.md`, `AGENTS.md`,
 * `GEMINI.md`, …). Each agent has at most one global file, in the home folder, and one file per
 * project, at the project root or in a folder of its own.
 */

/** Where one agent reads its instructions. Paths use `/` and are relative to home or project. */
export interface AgentInstructionPaths {
  /** Relative to the home folder. */
  global?: string;
  /** Relative to the project root. */
  project?: string;
}

/**
 * The single-file instructions of the built-in agents, by agent key. Agents that read a folder of
 * rule files instead (Cline, Roo Code, Kiro, …) are left out: one file per agent is the model.
 */
export const AGENT_INSTRUCTION_FILES: Readonly<Record<string, AgentInstructionPaths>> = {
  claude_code: { global: ".claude/CLAUDE.md", project: "CLAUDE.md" },
  codex: { global: ".codex/AGENTS.md", project: "AGENTS.md" },
  gemini_cli: { global: ".gemini/GEMINI.md", project: "GEMINI.md" },
  antigravity: { global: ".gemini/GEMINI.md" },
  qwen_code: { global: ".qwen/QWEN.md", project: "QWEN.md" },
  opencode: { global: ".config/opencode/AGENTS.md", project: "AGENTS.md" },
  amp: { global: ".config/amp/AGENTS.md", project: "AGENTS.md" },
  github_copilot: {
    global: ".copilot/copilot-instructions.md",
    project: ".github/copilot-instructions.md",
  },
  goose: { global: ".config/goose/.goosehints", project: ".goosehints" },
  windsurf: { global: ".codeium/windsurf/memories/global_rules.md" },
  droid: { global: ".factory/AGENTS.md", project: "AGENTS.md" },
  pi: { global: ".pi/agent/AGENTS.md", project: "AGENTS.md" },
  cursor: { project: "AGENTS.md" },
  warp: { project: "AGENTS.md" },
  crush: { project: "CRUSH.md" },
  junie: { project: ".junie/guidelines.md" },
};

export type InstructionScope = "global" | "project";

/** An agent that reads an instruction file. */
export interface InstructionReader {
  agentKey: string;
  agentName: string;
}

/**
 * One instruction file on this machine, or the place one would go. Agents that read the same
 * file (`AGENTS.md` at a project root, or a `CLAUDE.md` linked to it) share one entry.
 */
export interface InstructionFile {
  scope: InstructionScope;
  /** Set for project files. */
  projectId: string | null;
  /** Absolute path, as the first reader looks for it. */
  path: string;
  /** File name, e.g. `CLAUDE.md`. */
  name: string;
  exists: boolean;
  /** When `path` is a link: the file it leads to. */
  linkTarget: string | null;
  size: number | null;
  /** Epoch ms. */
  modifiedAt: number | null;
  /** Agents that read this file, in agent order. The first one names it in edit links. */
  readers: InstructionReader[];
}
