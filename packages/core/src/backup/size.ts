import { dirname, join } from "node:path";
import {
  APP_SLUG,
  BACKUP_REPO_WARN_BYTES,
  BACKUP_SKILL_LIMIT_BYTES,
  type OversizedSkill,
  type SizeReport,
} from "@loadout/shared";
import {
  GIT_DIR,
  dirSize,
  ensureDir,
  readDirSafe,
  statOrNull,
  writeFileAtomic,
  GIT_IGNORE_FILE,
  readTextOrNull,
} from "../util/fs";
import { LEFT_OUT_LINES } from "../util/left-out";
import { type BackupEnv, SKILL_METADATA_SUBDIR } from "./env";
import { metadataFileName } from "../skills/portable-format";

/**
 * Size rules. A skill over the per-skill limit is kept out of the backup through a managed block
 * in `.git/info/exclude`, unless git already tracks it, because untracking would look like a
 * delete to every other device. The block lists this device's own large skills, so it stays out
 * of the shared `.gitignore`: there, two devices would rewrite it back and forth on every sync.
 * It is rebuilt before each commit, so a skill that shrank comes back.
 */

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
/** Inside `.git`: the ignore file git reads for this clone only. */
const GIT_EXCLUDE_PATH = ["info", "exclude"] as const;

interface MeasuredSkill {
  name: string;
  bytes: number;
}

function escapeIgnorePath(name: string): string {
  return name.replace(IGNORE_SPECIAL_CHARS, (ch) => `\\${ch}`);
}

export function ignoreFilePath(env: BackupEnv): string {
  return join(env.repoDir, GIT_IGNORE_FILE);
}

/** The ignore file as it is now; null when there is none. */
export function readIgnoreText(env: BackupEnv): string | null {
  return readTextOrNull(ignoreFilePath(env));
}

/** Git's ignore file for this clone only: never committed, so never seen by another device. */
function excludeFilePath(env: BackupEnv): string {
  return join(env.repoDir, GIT_DIR, ...GIT_EXCLUDE_PATH);
}

/** An ignore file's lines: the user's own, as written, and the managed block's patterns. */
function splitIgnoreFile(text: string): { user: string[]; managed: string[] } {
  const user: string[] = [];
  const managed: string[] = [];
  let insideBlock = false;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === BLOCK_START) insideBlock = true;
    else if (trimmed === BLOCK_END) insideBlock = false;
    else if (!insideBlock) user.push(line);
    else if (trimmed) managed.push(trimmed);
  }
  return { user, managed };
}

/**
 * Bytes per top-level entry of what a backup would hold: files git tracks or would add, so
 * `node_modules/`, `.env` and the user's own patterns never count. Skills kept out for their
 * size alone are measured as if they were not, or they would shrink to nothing and come back.
 */
async function backedUpSizes(env: BackupEnv): Promise<Map<string, number> | null> {
  // The standard lines count even before they are first written into the ignore file. A block
  // an older version wrote into `.gitignore` counts until the next refresh moves it.
  const managed = [readTextOrNull(excludeFilePath(env)), readIgnoreText(env)].flatMap(
    (text) => splitIgnoreFile(text ?? "").managed,
  );
  const overrides = [
    ...BASE_IGNORE_LINES.map((line) => `--exclude=${line}`),
    ...managed.map((line) => `--exclude=!${line}`),
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
    if (row)
      lines.push(`/${env.metadataName}/${SKILL_METADATA_SUBDIR}/${metadataFileName(row.id)}`);
  }
  lines.push(BLOCK_END);
  return lines;
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
  return trimBlankEdges(splitIgnoreFile(text).user.filter((line) => !base.has(line.trim())));
}

/** Write `lines` to `path` when they differ from what is there; no lines make an empty file. */
function writeLinesIfChanged(path: string, current: string, lines: readonly string[]): void {
  const next = lines.length > 0 ? `${lines.join("\n")}\n` : "";
  if (next !== current) writeFileAtomic(path, next);
}

/**
 * Make sure the standard ignore lines exist and the managed block matches today's sizes. The
 * standard lines always come first, in their own order, so a line added in a newer version (and
 * a `!` line among them) lands where it belongs and the user's own lines still have the last say.
 */
export async function refreshIgnoreFile(
  env: BackupEnv,
  /** The user's own lines to write; those of the file as it is when left out. */
  custom?: readonly string[],
): Promise<void> {
  const { oversized } = await findOversized(env);
  const block = managedBlock(
    env,
    oversized.filter((skill) => skill.excluded),
  );

  const current = readIgnoreText(env) ?? "";
  custom ??= customLines(current);
  writeLinesIfChanged(ignoreFilePath(env), current, [
    ...BASE_IGNORE_LINES,
    ...(custom.length > 0 ? ["", ...custom] : []),
  ]);

  // The block goes after whatever else this clone's exclude file holds (git's own template).
  const excludePath = excludeFilePath(env);
  const excludeText = readTextOrNull(excludePath) ?? "";
  const own = trimBlankEdges(splitIgnoreFile(excludeText).user);
  const gap = own.length > 0 && block.length > 0 ? [""] : [];
  if (!excludeText && block.length === 0) return;
  ensureDir(dirname(excludePath));
  writeLinesIfChanged(excludePath, excludeText, [...own, ...gap, ...block]);
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
