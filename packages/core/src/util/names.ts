import { basename } from "node:path";
import { WINDOWS_DEVICE_NAMES, firstFreeName } from "@loadout/shared";
import { invalid } from "../errors";

const FORBIDDEN_CHARS = /[<>:"/\\|?*]/g;
const FALLBACK_SKILL_NAME = "unknown-skill";
const FALLBACK_SLUG = "skill";
const FALLBACK_AGENT_KEY = "agent";
const AGENT_KEY_SEPARATOR = "_";
const LAST_CONTROL_CODE = 0x1f;
const DELETE_CODE = 0x7f;

function replaceControlChars(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    out += code <= LAST_CONTROL_CODE || code === DELETE_CODE ? "_" : ch;
  }
  return out;
}

/**
 * Turn user or frontmatter text into a safe single folder name.
 * Keeps case and spaces; only strips what a filesystem cannot hold, and leading dots: a skill
 * called `.git` or `.loadout` would land on the backup repository or our own metadata.
 */
export function sanitizeSkillName(input: string): string {
  const last = basename(input.replaceAll("\\", "/").trim());
  if (last === "." || last === "..") throw invalid(`Invalid skill name: '${input}'`);
  let name = replaceControlChars(last).replace(FORBIDDEN_CHARS, "_").trim();
  name = name.replace(/^[.\s]+|[.\s]+$/g, "");
  if (!name) throw invalid(`Invalid skill name: '${input}'`);
  const stem = name.split(".")[0] ?? name;
  if (WINDOWS_DEVICE_NAMES.test(stem)) name = `_${name}`;
  return name;
}

export function trySanitizeSkillName(input: string | null | undefined): string | null {
  if (!input?.trim()) return null;
  try {
    return sanitizeSkillName(input);
  } catch {
    return null;
  }
}

/** Frontmatter name, else folder name, else a fixed fallback. */
export function inferSkillName(frontmatterName: string | null, dirPath: string): string {
  return (
    trySanitizeSkillName(frontmatterName) ??
    trySanitizeSkillName(basename(dirPath)) ??
    FALLBACK_SKILL_NAME
  );
}

/** Lowercase slug keeping `a-z 0-9 - _ .`; used for linked-workspace keys and loose name matching. */
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9\-_.]+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");
  return slug || FALLBACK_SLUG;
}

/** Key for a custom agent, unique among `taken`. */
export function agentKeyFromName(name: string, taken: ReadonlySet<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || FALLBACK_AGENT_KEY;
  return firstFreeName(base, (candidate) => !taken.has(candidate), AGENT_KEY_SEPARATOR);
}

/**
 * One file or folder name that every system the library syncs to can hold: no reserved or
 * control characters, no trailing dot or space, no device name like `con`.
 */
export function isPortableName(name: string): boolean {
  if (!name || name === "." || name === "..") return false;
  if (replaceControlChars(name) !== name) return false;
  if (new RegExp(FORBIDDEN_CHARS.source).test(name)) return false;
  if (/[.\s]$/.test(name)) return false;
  return !WINDOWS_DEVICE_NAMES.test(name.split(".")[0] ?? name);
}
