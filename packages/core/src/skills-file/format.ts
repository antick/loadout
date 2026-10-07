import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  APP_NAME,
  CLI_BINARY_NAME,
  type LockedFolder,
  type LockedSource,
  SKILLS_FILE_NAME,
  SKILLS_LOCK_NAME,
  type SkillsFileInfo,
  type SkillsFileSource,
  type SkillsFileSpec,
  type SkillsLock,
  isRecord,
} from "@loadout/shared";
import { TomlError, parse, stringify } from "smol-toml";
import { invalid } from "../errors";
import { statOrNull, writeFileAtomic } from "../util/fs";
import { compareText } from "../util/text";

export const LOCK_VERSION = 1;
/** Wildcard for "every skill of the source", as some people write it. */
const ALL_SKILLS = "*";
const TOP_KEYS = new Set(["agents", "gitignore", "sources"]);
const SOURCE_KEYS = new Set(["url", "ref", "skills"]);

const HEADER = [
  `# Skills this project uses. ${APP_NAME} reads this file: run \`${CLI_BINARY_NAME} project apply\`,`,
  `# or open the project in the app. ${SKILLS_LOCK_NAME} next to it pins the exact commits;`,
  "# commit both.",
  "",
].join("\n");

function fail(path: string, message: string): never {
  throw invalid(`${path}: ${message}`);
}

function stringList(path: string, key: string, value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    fail(path, `${key} must be a list of names in quotes, like ["a", "b"]`);
  }
  return value.map((item: string) => item.trim()).filter(Boolean);
}

function unknownKeys(path: string, where: string, record: object, allowed: Set<string>): void {
  const extra = Object.keys(record).filter((key) => !allowed.has(key));
  if (extra.length > 0) fail(path, `unknown ${where} ${extra.join(", ")}`);
}

function readSource(path: string, value: unknown, index: number): SkillsFileSource {
  const where = `sources[${index + 1}]`;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, `${where} must be a [[sources]] table`);
  }
  const record = value as Record<string, unknown>;
  unknownKeys(path, `key in ${where}:`, record, SOURCE_KEYS);
  const url = typeof record.url === "string" ? record.url.trim() : "";
  if (!url) fail(path, `${where} needs url = "…"`);
  if (record.ref !== undefined && typeof record.ref !== "string") {
    fail(path, `${where}: ref must be a branch or tag name in quotes`);
  }
  const ref = typeof record.ref === "string" && record.ref.trim() ? record.ref.trim() : null;
  let skills: string[] | null = null;
  if (record.skills !== undefined) {
    const names = stringList(path, `${where}: skills`, record.skills);
    skills = names.includes(ALL_SKILLS) ? null : names;
  }
  return { url, ref, skills };
}

/** Read and check `skills.toml`. Throws INVALID_INPUT naming the file and what is wrong. */
export function parseSkillsFile(path: string, text: string): SkillsFileSpec {
  let data: Record<string, unknown>;
  try {
    data = parse(text);
  } catch (error) {
    const reason = error instanceof TomlError ? error.message.split("\n")[0] : String(error);
    fail(path, `not valid TOML: ${reason}`);
  }
  unknownKeys(path, "key", data, TOP_KEYS);
  const agents = data.agents === undefined ? [] : stringList(path, "agents", data.agents);
  if (agents.length === 0) fail(path, `say which agents get the skills: agents = ["claude_code"]`);
  if (data.gitignore !== undefined && typeof data.gitignore !== "boolean") {
    fail(path, "gitignore must be true or false");
  }
  const rawSources = data.sources === undefined ? [] : data.sources;
  if (!Array.isArray(rawSources)) fail(path, "sources must be [[sources]] tables");
  const sources = rawSources.map((source, index) => readSource(path, source, index));
  const seen = new Set<string>();
  for (const source of sources) {
    const key = `${source.url}#${source.ref ?? ""}`;
    if (seen.has(key)) fail(path, `${source.url} is listed twice`);
    seen.add(key);
  }
  return { agents: [...new Set(agents)], gitignore: data.gitignore === true, sources };
}

/** The file as text, with a short header saying what it is. */
export function stringifySkillsFile(spec: SkillsFileSpec): string {
  const data: Record<string, unknown> = { agents: spec.agents };
  if (spec.gitignore) data.gitignore = true;
  data.sources = spec.sources.map((source) => ({
    url: source.url,
    ...(source.ref ? { ref: source.ref } : {}),
    ...(source.skills ? { skills: source.skills } : {}),
  }));
  return `${HEADER}${stringify(data)}\n`;
}

/** A commit id as Git writes it: the lock is untrusted, and this goes to `git fetch`. */
const REVISION = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

function isLockedSource(value: unknown): value is LockedSource {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.url === "string" &&
    (record.ref === null || typeof record.ref === "string") &&
    typeof record.revision === "string" &&
    REVISION.test(record.revision)
  );
}

function isLockedFolder(value: unknown): value is LockedFolder {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.folder === "string" &&
    typeof record.url === "string" &&
    typeof record.skillPath === "string" &&
    typeof record.hash === "string"
  );
}

/** The lock next to `skills.toml`; null when there is none. Entries that do not read are dropped. */
function readLock(path: string): SkillsLock | null {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (!statOrNull(path)) return null;
    throw invalid(`${path} is not valid JSON: ${error instanceof Error ? error.message : ""}`);
  }
  const record = isRecord(raw) ? raw : {};
  return {
    version: typeof record.version === "number" ? record.version : LOCK_VERSION,
    sources: Array.isArray(record.sources) ? record.sources.filter(isLockedSource) : [],
    folders: Array.isArray(record.folders) ? record.folders.filter(isLockedFolder) : [],
  };
}

/**
 * Write the lock sorted, so it only changes when what it pins changes. Byte order, not the
 * computer's language: the file is committed, and two people's computers must agree on it.
 */
export function writeLock(path: string, lock: SkillsLock): void {
  const sorted: SkillsLock = {
    version: LOCK_VERSION,
    sources: [...lock.sources].sort((a, b) =>
      compareText(`${a.url}#${a.ref ?? ""}`, `${b.url}#${b.ref ?? ""}`),
    ),
    folders: [...lock.folders].sort((a, b) => compareText(a.folder, b.folder)),
  };
  writeFileAtomic(path, `${JSON.stringify(sorted, null, 2)}\n`);
}

/** `skills.toml` in `start` or the nearest folder above it; null when there is none. */
export function findSkillsFile(start: string): string | null {
  let dir = start;
  for (;;) {
    const candidate = join(dir, SKILLS_FILE_NAME);
    if (statOrNull(candidate)?.isFile()) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Everything known about a skills file at `path`. */
export function loadSkillsFile(path: string): SkillsFileInfo {
  const root = dirname(path);
  const lockPath = join(root, SKILLS_LOCK_NAME);
  return {
    root,
    path,
    spec: parseSkillsFile(path, readFileSync(path, "utf8")),
    lockPath,
    lock: readLock(lockPath),
  };
}
