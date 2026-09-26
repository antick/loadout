import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  type CreateSkillInput,
  NEW_SKILL_DOCUMENT,
  SKILL_DESCRIPTION_MAX,
  SKILL_NAME_MAX,
  type Skill,
  newSkillDescriptionProblem,
  newSkillDocument,
  newSkillNameProblem,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { exists, invalid } from "../errors";
import type { InstallIntoLibrary } from "../install/library";
import { readDirSafe } from "../util/fs";
import type { SkillStore } from "./store";

const DRAFT_DIR_PREFIX = "loadout-new-skill-";

const NAME_MESSAGES = {
  empty: "Give the skill a name.",
  format:
    "Use only lowercase letters, numbers and single hyphens, and do not start or end with a hyphen.",
  too_long: `The name can be at most ${SKILL_NAME_MAX} characters.`,
  reserved: "That name is reserved by Windows and cannot be a folder name.",
} as const;

const DESCRIPTION_MESSAGES = {
  empty: "Describe what the skill does and when an agent should use it.",
  too_long: `The description can be at most ${SKILL_DESCRIPTION_MAX} characters.`,
} as const;

/**
 * Whether `name` is taken in the library, by a skill's name or by any folder. Compared without
 * case, so a skill never lands next to one whose name differs only in case.
 */
export function isSkillNameTaken(ctx: CoreContext, store: SkillStore, name: string): boolean {
  const wanted = name.toLowerCase();
  const names = store
    .list()
    .flatMap((skill) => [skill.name.toLowerCase(), basename(skill.libraryPath).toLowerCase()]);
  const folders = readDirSafe(ctx.paths.skillsDir).map((entry) => entry.name.toLowerCase());
  return names.includes(wanted) || folders.includes(wanted);
}

/**
 * Write a new skill into the library. The document is built in a temporary folder and goes in
 * through the one library entry point, so it is recorded, locked and backed up like any install.
 * It has no source to update from, the same as a folder found in the library by hand.
 */
export async function createSkill(
  ctx: CoreContext,
  store: SkillStore,
  install: InstallIntoLibrary,
  input: CreateSkillInput,
): Promise<Skill> {
  const name = input.name.trim();
  const description = input.description.trim();
  const nameProblem = newSkillNameProblem(name);
  if (nameProblem) throw invalid(NAME_MESSAGES[nameProblem]);
  const descriptionProblem = newSkillDescriptionProblem(description);
  if (descriptionProblem) throw invalid(DESCRIPTION_MESSAGES[descriptionProblem]);
  if (isSkillNameTaken(ctx, store, name)) {
    throw exists(`The library already has a skill or folder named ${name}.`);
  }

  const parent = await mkdtemp(join(tmpdir(), DRAFT_DIR_PREFIX));
  try {
    const draft = join(parent, name);
    await mkdir(draft);
    await writeFile(join(draft, NEW_SKILL_DOCUMENT), newSkillDocument({ name, description }));
    return await install({
      sourceDir: draft,
      name,
      record: { sourceType: "import", sourceRef: null, updateStatus: "local_only" },
      activityKind: "create",
    });
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}
