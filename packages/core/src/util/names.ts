import { basename } from "node:path";
import { invalid } from "../errors";

const FORBIDDEN_CHARS = /[<>:"/\\|?*]/g;
const WINDOWS_DEVICE_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const FALLBACK_SKILL_NAME = "unknown-skill";
const FALLBACK_SLUG = "skill";
const FALLBACK_AGENT_KEY = "agent";
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
 * Keeps case and spaces; only strips what a filesystem cannot hold.
 */
export function sanitizeSkillName(input: string): string {
  const last = basename(input.replaceAll("\\", "/").trim());
  if (last === "." || last === "..") throw invalid(`Invalid skill name: '${input}'`);
  let name = replaceControlChars(last).replace(FORBIDDEN_CHARS, "_").trim();
  name = name.replace(/\.+$/, "").trim();
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
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

/** First of `name`, `name-2`, `name-3`… that `isFree` accepts. */
export function firstFreeName(name: string, isFree: (candidate: string) => boolean): string {
  if (isFree(name)) return name;
  let n = 2;
  while (!isFree(`${name}-${n}`)) n += 1;
  return `${name}-${n}`;
}
