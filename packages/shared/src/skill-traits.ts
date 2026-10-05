/**
 * What a skill can make an agent do beyond reading it: run files it ships, register hooks, start
 * MCP servers, or use tools without asking. Shown as information so a person can look before they
 * trust a skill; never an error, since plenty of good skills ship scripts.
 *
 * Found from the frontmatter and the file list only. Nothing is read or run to decide.
 */

import { isRecord } from "./is-record";

export const SKILL_TRAIT_CODES = ["scripts", "hooks", "mcp", "tool_grants"] as const;
export type SkillTraitCode = (typeof SKILL_TRAIT_CODES)[number];

export interface SkillTrait {
  code: SkillTraitCode;
  /** English sentence for the CLI and logs; the app words it from `code` and `params`. */
  message: string;
  params: Record<string, string | number>;
}

/** Traits that put code on the computer to run: what "Runs code" stands for. */
export const CODE_TRAIT_CODES: readonly SkillTraitCode[] = ["scripts", "hooks", "mcp"];

/** File names listed in a message before it says "and more". */
export const TRAIT_EXAMPLES_MAX = 3;
/** A list of tools longer than this is cut in a message. */
export const TRAIT_TEXT_MAX = 120;

const MESSAGES: Record<SkillTraitCode, (params: Record<string, string | number>) => string> = {
  scripts: (p) => {
    const more = Number(p.count) - TRAIT_EXAMPLES_MAX;
    return `Ships ${p.count} file${p.count === 1 ? "" : "s"} that can run: ${p.examples}${more > 0 ? ` and ${more} more` : ""}.`;
  },
  hooks: (p) => `Registers hooks that run commands${p.events ? ` (${p.events})` : ""}.`,
  mcp: (p) => `Starts MCP servers${p.servers ? ` (${p.servers})` : ""}.`,
  tool_grants: (p) => `Lets the agent use tools without asking: ${p.tools}.`,
};

export function skillTrait(
  code: SkillTraitCode,
  params: Record<string, string | number> = {},
): SkillTrait {
  return { code, message: MESSAGES[code](params), params };
}

/** True when any trait puts code on the computer to run. */
export function runsCode(traits: readonly SkillTrait[]): boolean {
  return traits.some((trait) => CODE_TRAIT_CODES.includes(trait.code));
}

/** Traits in a fixed order, one per code. */
function inOrder(traits: readonly SkillTrait[]): SkillTrait[] {
  return SKILL_TRAIT_CODES.flatMap((code) => traits.filter((trait) => trait.code === code));
}

/** Merge lists of traits; a code found twice keeps its first entry. */
export function mergeTraits(...lists: readonly (readonly SkillTrait[])[]): SkillTrait[] {
  const seen = new Set<SkillTraitCode>();
  const merged: SkillTrait[] = [];
  for (const trait of lists.flat()) {
    if (seen.has(trait.code)) continue;
    seen.add(trait.code);
    merged.push(trait);
  }
  return inOrder(merged);
}

// ── Files ──

/** Extensions of files an agent or a shell can run. */
const SCRIPT_EXTENSIONS: ReadonlySet<string> = new Set([
  "sh",
  "bash",
  "zsh",
  "fish",
  "py",
  "js",
  "mjs",
  "cjs",
  "ts",
  "rb",
  "pl",
  "php",
  "lua",
  "ps1",
  "psm1",
  "bat",
  "cmd",
]);

/**
 * Extensions of files that hold text or media. One with the executable bit set is a mistake of
 * whoever packed the folder, not a program (`chmod -R 755` marks every `SKILL.md`).
 */
const DATA_EXTENSIONS: ReadonlySet<string> = new Set([
  "md",
  "markdown",
  "txt",
  "json",
  "yaml",
  "yml",
  "toml",
  "csv",
  "tsv",
  "xml",
  "html",
  "css",
  "svg",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "pdf",
  "ttf",
  "otf",
  "woff",
  "woff2",
  "zip",
  "lock",
]);

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** A file an agent or a shell can run: a script by its extension, or anything else marked executable. */
function isRunnableFile(path: string, executable: boolean): boolean {
  const extension = extensionOf(path);
  if (SCRIPT_EXTENSIONS.has(extension)) return true;
  return executable && !DATA_EXTENSIONS.has(extension);
}

/** The `scripts` trait for the files of a skill (`/` separated paths), or null when none can run. */
export function scriptsTrait(
  files: readonly { path: string; executable: boolean }[],
): SkillTrait | null {
  const runnable = files.filter((file) => isRunnableFile(file.path, file.executable));
  if (runnable.length === 0) return null;
  const names = runnable.slice(0, TRAIT_EXAMPLES_MAX).map((file) => file.path);
  return skillTrait("scripts", { count: runnable.length, examples: names.join(", ") });
}

// ── Frontmatter ──

const HOOKS_KEYS = ["hooks"] as const;
const MCP_KEYS = ["mcp-servers", "mcp_servers", "mcpServers"] as const;
const TOOL_KEYS = ["allowed-tools", "allowed_tools"] as const;

/** A value that says something: not absent, empty, `false` or an empty list or map. */
export function isFilled(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function firstFilled(data: Readonly<Record<string, unknown>>, keys: readonly string[]): unknown {
  for (const key of keys) if (isFilled(data[key])) return data[key];
  return undefined;
}

/** Split a list of tools at commas and spaces that are not inside parentheses: `Bash(git *)`. */
function splitTools(text: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const char of text) {
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && (char === "," || /\s/.test(char))) {
      if (current) parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/** The names in a map's keys, a list's items or a text's words, for a short message. */
function namesIn(value: unknown): string {
  let names: string[] = [];
  if (Array.isArray(value)) names = value.map(String);
  else if (isRecord(value)) names = Object.keys(value);
  else if (typeof value === "string") names = splitTools(value);
  const text = names.filter(Boolean).join(", ");
  return text.length > TRAIT_TEXT_MAX ? `${text.slice(0, TRAIT_TEXT_MAX)}…` : text;
}

/** Hooks, MCP servers and pre-approved tools a skill's parsed frontmatter declares. */
export function traitsFromFrontmatter(data: Readonly<Record<string, unknown>>): SkillTrait[] {
  const found: SkillTrait[] = [];
  const hooks = firstFilled(data, HOOKS_KEYS);
  if (hooks !== undefined) found.push(skillTrait("hooks", { events: namesIn(hooks) }));
  const mcp = firstFilled(data, MCP_KEYS);
  if (mcp !== undefined) found.push(skillTrait("mcp", { servers: namesIn(mcp) }));
  const tools = firstFilled(data, TOOL_KEYS);
  if (tools !== undefined) found.push(skillTrait("tool_grants", { tools: namesIn(tools) }));
  return found;
}
