import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  APP_SLUG,
  BACKUP_REPO_WARN_BYTES,
  BACKUP_SKILL_LIMIT_BYTES,
  type OversizedSkill,
  type SizeReport,
} from "@skillboard/shared";
import { dirSize, readDirSafe, statOrNull, writeFileAtomic } from "../util/fs";
import { type BackupEnv, SKILL_METADATA_SUBDIR } from "./env";

/**
 * Size rules. A skill over the per-skill limit is kept out of the backup through a managed block
 * in `.gitignore` — unless git already tracks it, because untracking would look like a delete to
 * every other device. The block is rebuilt before each commit, so a skill that shrank comes back.
 */

const IGNORE_FILE = ".gitignore";
const GIT_DIR = ".git";
const BASE_IGNORE_LINES = [".DS_Store", "Thumbs.db", "__pycache__/", "*.pyc"] as const;
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

function measureSkills(env: BackupEnv): { skills: MeasuredSkill[]; totalBytes: number } {
  const skills: MeasuredSkill[] = [];
  let totalBytes = 0;
  for (const entry of readDirSafe(env.repoDir)) {
    if (entry.name === GIT_DIR) continue;
    const full = join(env.repoDir, entry.name);
    if (entry.isDirectory()) {
      const bytes = dirSize(full);
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
  const { skills, totalBytes } = measureSkills(env);
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

/** Make sure the standard ignore lines exist and the managed block matches today's sizes. */
export async function refreshIgnoreFile(env: BackupEnv): Promise<void> {
  const path = join(env.repoDir, IGNORE_FILE);
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  const lines = userLines(current);
  const present = new Set(lines.map((line) => line.trim()));
  for (const wanted of BASE_IGNORE_LINES) if (!present.has(wanted)) lines.push(wanted);

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
