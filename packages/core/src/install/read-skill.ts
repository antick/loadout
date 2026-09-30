import type { InstallOptions, PreviewedSkill } from "@loadout/shared";
import { invalid, notFound } from "../errors";
import { readSkillDocument, readSkillIdentity } from "../skills/metadata";
import { isSkillDir, statOrNull } from "../util/fs";
import type { SafetyGate } from "./safety-gate";

/**
 * A skill read without installing it (`skills use`): its `SKILL.md` as written, after the same
 * safety check an install runs. Throws UNSAFE, with the findings, when the check flags it and
 * `acceptRisk` is not set, so a flagged prompt never reaches an agent unasked.
 */
export async function readCheckedSkill(
  safety: SafetyGate | undefined,
  candidate: { name: string; dir: string },
  options: InstallOptions & { progressKey?: string } = {},
): Promise<PreviewedSkill> {
  const found = readSkillDocument(candidate.dir);
  if (!found) throw notFound(`${candidate.name} has no SKILL.md to read.`);
  const [report] = safety ? await safety.check([candidate], options) : [null];
  return { name: candidate.name, document: found.content, safety: report ?? null };
}

/** A skill folder on this computer, read where it is. */
export async function readFolderSkill(
  safety: SafetyGate | undefined,
  folderPath: string,
  options: InstallOptions = {},
): Promise<PreviewedSkill> {
  if (!statOrNull(folderPath)) throw notFound(`Nothing found at ${folderPath}`);
  if (!isSkillDir(folderPath)) throw invalid(`No SKILL.md found in ${folderPath}`);
  return readCheckedSkill(
    safety,
    { name: readSkillIdentity(folderPath).name, dir: folderPath },
    options,
  );
}
