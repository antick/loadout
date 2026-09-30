import type { InstallOptions, PreviewedSkill } from "@loadout/shared";
import { notFound } from "../errors";
import { readSkillDocument } from "../skills/metadata";
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
