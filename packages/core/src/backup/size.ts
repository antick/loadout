import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  APP_SLUG,
  BACKUP_REPO_WARN_BYTES,
  BACKUP_SKILL_LIMIT_BYTES,
  type OversizedSkill,
  type SizeReport,
} from "@loadout/shared";
import { dirSize, readDirSafe, statOrNull, writeFileAtomic } from "../util/fs";
import { LEFT_OUT_LINES } from "../util/left-out";
import { type BackupEnv, SKILL_METADATA_SUBDIR } from "./env";

/**
 * Size rules. A skill over the per-skill limit is kept out of the backup through a managed block
 * in `.gitignore`, unless git already tracks it, because untracking would look like a delete to
 * every other device. The block is rebuilt before each commit, so a skill that shrank comes back.
 */

export const IGNORE_FILE = ".gitignore";
const GIT_DIR = ".git";
/**
 * `writeFileAtomic` writes `<file>.tmp.<uuid>` and renames it. Git must never pick one up: it can
 * vanish between git listing it and reading it, which fails the whole commit.
 */
const ATOMIC_TEMP_PATTERN = "*.tmp.????????-????-????-????-????????????";
/**
 * Left out of every backup, shown to the user as the defaults: what never leaves this computer
 * (`util/left-out.ts`, the same list a published copy leaves out). Files left out stay on this
 * device through merges (see `ignored.ts`).
 */
export const DEFAULT_IGNORE_LINES: readonly string[] = LEFT_OUT_LINES;
export const BASE_IGNORE_LINES: readonly string[] = [...DEFAULT_IGNORE_LINES, ATOMIC_TEMP_PATTERN];
const BLOCK_START = `# ${APP_SLUG}: skills over the backup size limit (managed, do not edit)`;
const BLOCK_END = `# ${APP_SLUG}: end of managed block`;
const IGNORE_SPECIAL_CHARS = /[\\*?[\]#! ]/g;

interface MeasuredSkill {
  name: string;
  bytes: number;
}

function escapeIgnorePath(name: string): string {
  return name.replace(IGNORE_SPECIAL_CHARS, (ch) => `\\${ch}`);
}

/** Lines of the managed block in the ignore file as it is now. */
function managedLines(env: BackupEnv): string[] {
  const path = join(env.repoDir, IGNORE_FILE);
  if (!existsSync(path)) return [];
  const lines: string[] = [];
  let insideBlock = false;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (line.trim() === BLOCK_START) insideBlock = true;
    else if (line.trim() === BLOCK_END) insideBlock = false;
    else if (insideBlock && line.trim()) lines.push(line.trim());
  }
  return lines;
}

/**
 * Bytes per top-level entry of what a backup would hold: files git tracks or would add, so
 * `node_modules/`, `.env` and the user's own patterns never count. Skills kept out for their
 * size alone are measured as if they were not, or they would shrink to nothing and come back.
 */
async function backedUpSizes(env: BackupEnv): Promise<Map<string, number> | null> {
  // The standard lines count even before they are first written into the ignore file.
  const overrides = [
    ...BASE_IGNORE_LINES.map((line) => `--exclude=${line}`),
    ...managedLines(env).map((line) => `--exclude=!${line}`),
  ];
  const result = await env.git.probe(["ls-files", "-z", "-co", "--exclude-standard", ...overrides]);
  if (result.code !== 0) return null;
  const sizes = new Map<string, number>();
  for (const file of result.stdout.split("\0")) {
    if (!file) continue;
    const top = file.split("/", 1)[0] ?? file;
    const bytes = statOrNull(join(env.repoDir, ...file.split("/")))?.size ?? 0;
    sizes.set(top, (sizes.get(top) ?? 0) + bytes);
  }
  return sizes;
}

async function measureSkills(
  env: BackupEnv,
): Promise<{ skills: MeasuredSkill[]; totalBytes: number }> {
  const sizes = await backedUpSizes(env);
  const skills: MeasuredSkill[] = [];
  let totalBytes = 0;
  for (const entry of readDirSafe(env.repoDir)) {
    if (entry.name === GIT_DIR) continue;
    const full = join(env.repoDir, entry.name);
    if (entry.isDirectory()) {
      // Before git is set up, every file counts.
      const bytes = sizes ? (sizes.get(entry.name) ?? 0) : dirSize(full);
      totalBytes += bytes;
      if (!entry.name.startsWith(".")) skills.push({ name: entry.name, bytes });
    } else if (entry.isFile()) {
      totalBytes += statOrNull(full)?.size ?? 0;
    }
  }
  return { skills, totalBytes };
}

/** Top-level names in the last commit. Empty before the first commit. */
async function trackedTopLevel(env: BackupEnv): Promise<Set<string>> {
  const result = await env.git.probe(["ls-tree", "-z", "--name-only", "HEAD"]);
  if (result.code !== 0) return new Set();
  return new Set(result.stdout.split("\0").filter(Boolean));
}

async function findOversized(
  env: BackupEnv,
): Promise<{ oversized: OversizedSkill[]; totalBytes: number }> {
  const { skills, totalBytes } = await measureSkills(env);
  const large = skills.filter((skill) => skill.bytes > BACKUP_SKILL_LIMIT_BYTES);
  if (large.length === 0) return { oversized: [], totalBytes };
  const tracked = await trackedTopLevel(env);
  const oversized = large
    .map(({ name, bytes }) => ({ name, bytes, excluded: !tracked.has(name) }))
    .sort((a, b) => b.bytes - a.bytes);
  return { oversized, totalBytes };
}

function managedBlock(env: BackupEnv, excluded: OversizedSkill[]): string[] {
  if (excluded.length === 0) return [];
  const lines = [BLOCK_START];
  for (const skill of excluded) {
    lines.push(`/${escapeIgnorePath(skill.name)}/`);
    // Its metadata stays out too, so no device ever sees a skill entry without a folder.
    const row = env.store.findByLibraryPath(join(env.repoDir, skill.name));
    if (row) lines.push(`/${env.metadataName}/${SKILL_METADATA_SUBDIR}/${row.id}.json`);
  }
  lines.push(BLOCK_END);
  return lines;
}

/** Everything in the file that is the user's own: not our block, not blank padding at the end. */
function userLines(current: string): string[] {
  const kept: string[] = [];
  let insideBlock = false;
  for (const line of current.split(/\r?\n/)) {
    if (line.trim() === BLOCK_START) insideBlock = true;
    else if (line.trim() === BLOCK_END) insideBlock = false;
    else if (!insideBlock) kept.push(line);
  }
  while (kept.length > 0 && kept[kept.length - 1]?.trim() === "") kept.pop();
  return kept;
}

/** Drop blank lines at both ends; blank lines in between are the user's layout. */
export function trimBlankEdges(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]?.trim() === "") start += 1;
  while (end > start && lines[end - 1]?.trim() === "") end -= 1;
  return lines.slice(start, end);
}

/** The user's own lines of an ignore file: neither the standard ones nor the managed block. */
export function customLines(text: string): string[] {
  const base = new Set(BASE_IGNORE_LINES);
  return trimBlankEdges(userLines(text).filter((line) => !base.has(line.trim())));
}

/**
 * Make sure the standard ignore lines exist and the managed block matches today's sizes. The
 * standard lines always come first, in their own order, so a line added in a newer version (and
 * a `!` line among them) lands where it belongs and the user's own lines still have the last say.
 */
export async function refreshIgnoreFile(env: BackupEnv): Promise<void> {
  const path = join(env.repoDir, IGNORE_FILE);
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  const custom = customLines(current);
  const lines = [...BASE_IGNORE_LINES, ...(custom.length > 0 ? ["", ...custom] : [])];

  const { oversized } = await findOversized(env);
  const block = managedBlock(
    env,
    oversized.filter((skill) => skill.excluded),
  );
  const next = `${[...lines, ...(block.length > 0 ? ["", ...block] : [])].join("\n")}\n`;
  if (next !== current) writeFileAtomic(path, next);
}

export async function buildSizeReport(env: BackupEnv): Promise<SizeReport> {
  const { oversized, totalBytes } = await findOversized(env);
  return {
    totalBytes,
    oversized,
    skillLimitBytes: BACKUP_SKILL_LIMIT_BYTES,
    repoWarnBytes: BACKUP_REPO_WARN_BYTES,
  };
}
