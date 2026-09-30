import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { redactUrl, validateGitInput } from "../install";
import type { EnvReader } from "../context";
import type { SourceLead } from "./evidence";
import { toPosix } from "../util/fs";

/**
 * The lock file `npx skills add` keeps: for every skill it installed, the repository and the
 * skill's path inside it. Reading it names a skill's source without guessing. It is only a lead:
 * the repository is compared with the library copy before anyone links it, like every other lead.
 */

const LOCK_FILE = ".skill-lock.json";
/** Skills that arrive through a lock file live in a repository; a folder on disk is no source. */
const LOCAL_SOURCE_TYPES: ReadonlySet<string> = new Set(["local", "file"]);
const SKILL_FILE_TAIL = /(?:^|\/)skill\.md$/i;
/** A lock file is a few kilobytes per skill; anything far larger is not one. */
const MAX_LOCK_BYTES = 8 * 1024 * 1024;

/** Where `npx skills` keeps the file: under `$XDG_STATE_HOME/skills` when set, else `~/.agents`. */
export function lockFilePaths(homeDir: string, env: Readonly<Record<string, string | undefined>>) {
  const paths: string[] = [];
  const state = env.XDG_STATE_HOME?.trim();
  if (state) paths.push(join(state, "skills", LOCK_FILE));
  paths.push(join(homeDir, ".agents", LOCK_FILE));
  return paths;
}

interface LockEntry {
  sourceUrl?: unknown;
  sourceType?: unknown;
  skillPath?: unknown;
}

function readEntries(path: string): Record<string, LockEntry> | null {
  try {
    if (statSync(path).size > MAX_LOCK_BYTES) return null;
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    const skills = (parsed as { skills?: unknown } | null)?.skills;
    return typeof skills === "object" && skills !== null && !Array.isArray(skills)
      ? (skills as Record<string, LockEntry>)
      : null;
  } catch {
    return null;
  }
}

/** The skill's own folder in the repository: `skills/pdf/SKILL.md` → `skills/pdf`; the top → null. */
function folderOf(skillPath: unknown): string | null {
  if (typeof skillPath !== "string") return null;
  const path = toPosix(skillPath).replace(/^\/+/, "");
  const folder = SKILL_FILE_TAIL.test(path) ? dirname(path) : path;
  return folder === "." || folder === "" ? null : folder;
}

/**
 * The lead the lock file gives for a skill called `name`, or null when it lists no repository for
 * it. The first file that knows the skill answers.
 */
export function lockFileLead(name: string, homeDir: string, env: EnvReader): SourceLead | null {
  for (const path of lockFilePaths(homeDir, env())) {
    const entries = readEntries(path);
    const entry = entries && Object.hasOwn(entries, name) ? entries[name] : undefined;
    if (!entry || typeof entry.sourceUrl !== "string") continue;
    if (typeof entry.sourceType === "string" && LOCAL_SOURCE_TYPES.has(entry.sourceType)) continue;
    let input: string;
    try {
      // Credentials stay out of the library; a folder or an unknown scheme is never a source.
      input = validateGitInput(redactUrl(entry.sourceUrl));
    } catch {
      continue;
    }
    return { input, evidence: "skills_lock", subpath: folderOf(entry.skillPath) };
  }
  return null;
}
