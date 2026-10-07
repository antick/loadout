import { unlinkSync } from "node:fs";
import {
  BACKUP_IGNORE_MAX_LINE_LENGTH,
  BACKUP_IGNORE_MAX_LINES,
  type BackupIgnoreRules,
} from "@loadout/shared";
import { invalid } from "../errors";
import { writeFileAtomic, GIT_IGNORE_FILE } from "../util/fs";
import { type BackupEnv, PRESET_METADATA_SUBDIR, SKILL_METADATA_SUBDIR } from "./env";
import { metadataFileName } from "../skills/portable-format";
import { assertRepo } from "./repo";
import {
  DEFAULT_IGNORE_LINES,
  customLines,
  ignoreFilePath,
  readIgnoreText,
  refreshIgnoreFile,
  trimBlankEdges,
} from "./size";

/**
 * The user's own "leave out of the backup" patterns: the lines of the library's `.gitignore`
 * that are neither the app's defaults nor the managed size block. The file travels with the
 * backup, so the patterns apply on every device.
 */

/** A made-up skill folder, to ask git whether a pattern would leave whole skills out. */
const PROBE_SKILL = "any-skill";
const PROBE_ID = "any-id";
const NEGATION = "!";

export function readIgnoreRules(env: BackupEnv): BackupIgnoreRules {
  assertRepo(env);
  return {
    defaults: [...DEFAULT_IGNORE_LINES],
    custom: customLines(readIgnoreText(env) ?? ""),
  };
}

function cleanInput(custom: readonly string[]): string[] {
  const lines = trimBlankEdges(
    custom.flatMap((entry) => String(entry).split(/\r?\n/)).map((line) => line.trimEnd()),
  );
  if (lines.length > BACKUP_IGNORE_MAX_LINES) {
    throw invalid(`Keep it to ${BACKUP_IGNORE_MAX_LINES} patterns or fewer.`);
  }
  const long = lines.find((line) => line.length > BACKUP_IGNORE_MAX_LINE_LENGTH);
  if (long !== undefined) {
    throw invalid(`A pattern is longer than ${BACKUP_IGNORE_MAX_LINE_LENGTH} characters.`);
  }
  if (lines.some((line) => line.includes("\0"))) throw invalid("A pattern holds a NUL character.");
  return lines;
}

/**
 * The first pattern that would leave a skill's `SKILL.md`, the app's metadata or the ignore file
 * itself out of the backup, or null. Asks git, so the answer follows git's own matching rules.
 */
async function blockingPattern(env: BackupEnv): Promise<string | null> {
  const probes = [
    `${PROBE_SKILL}/SKILL.md`,
    `${PROBE_SKILL}/skill.md`,
    `${env.metadataName}/${SKILL_METADATA_SUBDIR}/${metadataFileName(PROBE_ID)}`,
    `${env.metadataName}/${PRESET_METADATA_SUBDIR}/${metadataFileName(PROBE_ID)}`,
    GIT_IGNORE_FILE,
  ];
  const result = await env.git.probe(["check-ignore", "--no-index", "-v", "-z", "--stdin"], {
    input: probes.map((probe) => `${probe}\0`).join(""),
  });
  // Records of four fields: source, line number, pattern, path.
  const fields = result.stdout.split("\0");
  for (let index = 0; index + 3 < fields.length; index += 4) {
    const pattern = fields[index + 2] ?? "";
    // Only the library's own file; a rule in the user's global git settings is not ours to judge.
    if (fields[index] !== GIT_IGNORE_FILE) continue;
    // A path matched by a `!pattern` is kept, not left out.
    if (pattern && !pattern.startsWith(NEGATION)) return pattern;
  }
  return null;
}

/** Replace the user's patterns. Must run inside the library lock. */
export async function writeIgnoreRules(
  env: BackupEnv,
  custom: readonly string[],
): Promise<BackupIgnoreRules> {
  assertRepo(env);
  const lines = cleanInput(custom);
  const path = ignoreFilePath(env);
  const previous = readIgnoreText(env);
  try {
    // The standard lines and the user's, in one write; the size block goes to this clone's own.
    await refreshIgnoreFile(env, lines);
    const blocking = await blockingPattern(env);
    if (blocking !== null) {
      throw invalid(
        `"${blocking}" would leave whole skills or the app's own files out of the backup. Use a narrower pattern, such as "my-skill/cache/".`,
      );
    }
  } catch (error) {
    if (previous === null) unlinkSync(path);
    else writeFileAtomic(path, previous);
    throw error;
  }
  return readIgnoreRules(env);
}
