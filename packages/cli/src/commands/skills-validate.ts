import { type Core, type FolderCheck, checkSkillFolder, notFound } from "@loadout/core";
import { APP_NAME, type Skill, type SkillIssue, hasSkillErrors } from "@loadout/shared";

import { plural } from "../output";
import { resolveUserPath, allSkillsFlag, refsOrAll } from "./support";
import type { CommandResult, FreeCommandContext, FreeCommandSpec } from "./types";
import { exitCodeFor } from "../exit-codes";

const ALL_FLAG = allSkillsFlag();

const view = (skill: Skill) => ({ id: skill.id, name: skill.name, issues: skill.issues });

function describe(label: string, issues: readonly SkillIssue[]): string[] {
  if (issues.length === 0) return [`${label}: no problems.`];
  return [
    `${label}:`,
    ...issues.map((issue) =>
      issue.line === undefined
        ? `  ${issue.severity}: ${issue.message}`
        : `  ${issue.severity} (line ${issue.line}): ${issue.message}`,
    ),
  ];
}

/** Skill names never hold a slash, so anything that looks like a path is one. */
function looksLikePath(ref: string): boolean {
  return /^[.~]/.test(ref) || ref.includes("/") || ref.includes("\\");
}

function openLibrary(context: FreeCommandContext): Core {
  const core = context.openExisting();
  if (!core) {
    throw notFound(
      `There is no ${APP_NAME} library yet. To check skills outside one, give a folder: \`skills validate ./skills\`.`,
    );
  }
  return core;
}

async function validateLibrary(core: Core, ref: string | undefined): Promise<CommandResult> {
  const skills = ref === undefined ? await core.api.skills.list() : [core.store.resolve(ref)];
  const flagged = ref === undefined ? skills.filter((skill) => skill.issues.length > 0) : skills;
  const broken = skills.filter((skill) => hasSkillErrors(skill.issues));
  const lines = flagged.flatMap((skill) => describe(skill.name, skill.issues));
  if (ref === undefined) {
    lines.push(
      `Checked ${plural(skills.length, "skill")}: ${broken.length} with errors, ${
        flagged.length - broken.length
      } with warnings only.`,
    );
  }
  // `{ skills, duplicates }` for one skill, --all and a folder alike, so a reader handles one
  // shape: every skill checked, with its issues. Library names are never used twice.
  return {
    value: { skills: skills.map(view), duplicates: [] },
    text: lines.join("\n"),
    exitCode: exitCodeFor(broken.length > 0),
  };
}

function folderText(check: FolderCheck): string[] {
  const flagged = check.skills.filter((skill) => skill.issues.length > 0);
  const broken = check.skills.filter((skill) => hasSkillErrors(skill.issues));
  const lines = flagged.flatMap((skill) => describe(skill.path, skill.issues));
  for (const duplicate of check.duplicates) {
    lines.push(`error: ${plural(duplicate.paths.length, "skill")} are called "${duplicate.name}":`);
    lines.push(...duplicate.paths.map((path) => `  ${path}`));
  }
  lines.push(
    `Checked ${plural(check.skills.length, "skill")}: ${broken.length} with errors, ${
      flagged.length - broken.length
    } with warnings only, ${plural(check.duplicates.length, "name")} used twice.`,
  );
  return lines;
}

function validateFolder(context: FreeCommandContext, input: string): CommandResult {
  const root = resolveUserPath(input, context.cwd, context.homeDir);
  const check = checkSkillFolder(root);
  if (check.skills.length === 0) {
    throw notFound(`No skills in ${root}: no folder in it has a SKILL.md.`);
  }
  const failed =
    check.duplicates.length > 0 || check.skills.some((skill) => hasSkillErrors(skill.issues));
  return {
    value: check,
    text: folderText(check).join("\n"),
    exitCode: exitCodeFor(failed),
  };
}

/**
 * Check skills against the Agent Skills format: one library skill, all of them, or every skill in
 * a folder (no library needed, so a skills repository can run it in CI). Exit code 1 on errors.
 */
async function validate(context: FreeCommandContext): Promise<CommandResult> {
  const { args } = context;
  const [ref] = refsOrAll(args, "one skill, a folder", 1) ?? [];
  if (ref !== undefined && looksLikePath(ref)) return validateFolder(context, ref);
  return validateLibrary(openLibrary(context), ref);
}

export const validateCommand: FreeCommandSpec = {
  name: "validate",
  summary: "Check skills against the Agent Skills format",
  usage: "<ref> | <folder> | --all",
  flags: [ALL_FLAG],
  notes: [
    "Errors (missing SKILL.md, frontmatter, name or description, or YAML that does not parse) exit with code 1. Warnings (naming rules, lengths, links to missing files) do not.",
    "A folder (it starts with ./, ../, ~ or /) is checked without a library: every skill in it, and names used twice where an agent would load both. Use it in a skills repository's CI.",
  ],
  runWithoutLibrary: validate,
};
