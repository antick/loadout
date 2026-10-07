import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  APP_SLUG,
  type CreateSkillInput,
  SKILL_FILE,
  SKILL_DESCRIPTION_MAX,
  SKILL_NAME_MAX,
  type Skill,
  isNewSkillTemplate,
  newSkillDescriptionProblem,
  newSkillDocument,
  newSkillNameProblem,
  takenSkillNames,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { exists, invalid } from "../errors";
import type { InstallIntoLibrary } from "../install/library";
import { readDirSafe } from "../util/fs";
import type { SkillStore } from "./store";

const DRAFT_DIR_PREFIX = `${APP_SLUG}-new-skill-`;

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

/** Refuse a name a new (or renamed) skill may not have, saying what is wrong with it. */
export function checkSkillName(name: string): void {
  const problem = newSkillNameProblem(name);
  if (problem) throw invalid(NAME_MESSAGES[problem]);
}

/** The name and description trimmed, or an error saying what is wrong with the input. */
export function checkNewSkill(input: CreateSkillInput): CreateSkillInput {
  const name = input.name.trim();
  const description = input.description.trim();
  checkSkillName(name);
  const descriptionProblem = newSkillDescriptionProblem(description);
  if (descriptionProblem) throw invalid(DESCRIPTION_MESSAGES[descriptionProblem]);
  const { template } = input;
  if (template !== undefined && !isNewSkillTemplate(template)) {
    throw invalid(`There is no skill template called ${String(template)}.`);
  }
  return { name, description, template };
}

/**
 * Whether `name` is taken in the library: by a skill's name, its folder, or any other folder
 * there, compared without case. `except` is the skill being renamed: its own do not count.
 */
export function isLibraryNameTaken(
  store: SkillStore,
  skillsDir: string,
  name: string,
  except?: Skill,
): boolean {
  const wanted = name.toLowerCase();
  if (takenSkillNames(store.list(), except?.id).has(wanted)) return true;
  return readDirSafe(skillsDir).some(
    (entry) => entry.name !== except?.dirName && entry.name.toLowerCase() === wanted,
  );
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
  const checked = checkNewSkill(input);
  const { name } = checked;
  if (isLibraryNameTaken(store, ctx.paths.skillsDir, name)) {
    throw exists(`The library already has a skill or folder named ${name}.`);
  }

  const parent = await mkdtemp(join(tmpdir(), DRAFT_DIR_PREFIX));
  try {
    const draft = join(parent, name);
    await mkdir(draft);
    await writeFile(join(draft, SKILL_FILE), newSkillDocument(checked));
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
