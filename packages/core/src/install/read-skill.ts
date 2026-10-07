import type { InstallOptions, PreviewedSkill } from "@loadout/shared";
import { invalid, notFound } from "../errors";
import { readSkillDocument, readSkillIdentity } from "../skills/metadata";
import { isSkillDir, normalizeAbsolutePath, statOrNull } from "../util/fs";
import type { SafetyGate } from "./safety-gate";

/**
 * A skill read without installing it (`skills use`): its `SKILL.md` as written, after the same
 * safety check an install runs. Throws UNSAFE, with the findings, when the check flags it and
 * `acceptRisk` is not set, so a flagged prompt never reaches an agent unasked.
 */
export async function readCheckedSkill(
  safety: SafetyGate,
  candidate: { name: string; dir: string },
  options: InstallOptions & { progressKey?: string } = {},
): Promise<PreviewedSkill> {
  const found = readSkillDocument(candidate.dir);
  if (!found) throw notFound(`${candidate.name} has no SKILL.md to read.`);
  const [report] = await safety.check([candidate], options);
  return { name: candidate.name, document: found.content, safety: report ?? null };
}

/**
 * The skill folder a folder install takes, or why it cannot: the install, its dry run
 * (`skills install <folder> --dry-run`), reading a folder and relinking a skill to one refuse the
 * same things. Archives go through `previewArchive`, which lists what they hold first.
 */
export function requireSkillFolder(sourcePath: string): string {
  const path = normalizeAbsolutePath(sourcePath, "Source path");
  const stat = statOrNull(path);
  if (!stat) throw notFound(`Nothing found at ${path}`);
  if (!stat.isDirectory()) throw invalid(`Not a folder: ${path}`);
  if (!isSkillDir(path)) throw invalid(`No SKILL.md found in ${path}`);
  return path;
}

/** A skill folder on this computer, read where it is. */
export async function readFolderSkill(
  safety: SafetyGate,
  sourcePath: string,
  options: InstallOptions = {},
): Promise<PreviewedSkill> {
  const folderPath = requireSkillFolder(sourcePath);
  return readCheckedSkill(
    safety,
    { name: readSkillIdentity(folderPath).name, dir: folderPath },
    options,
  );
}
