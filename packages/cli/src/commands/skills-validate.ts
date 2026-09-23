import { type Skill, hasSkillErrors } from "@loadout/shared";
import { UsageError, flagBoolean } from "../args";
import { plural } from "../output";
import { limitPositionals } from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

const ALL_FLAG = {
  name: "all",
  type: "boolean",
  description: "Every skill in the library.",
} as const;

const view = (skill: Skill) => ({ id: skill.id, name: skill.name, issues: skill.issues });

function describe(skill: Skill): string[] {
  if (skill.issues.length === 0) return [`${skill.name}: no problems.`];
  return [
    `${skill.name}:`,
    ...skill.issues.map((issue) =>
      issue.line === undefined
        ? `  ${issue.severity}: ${issue.message}`
        : `  ${issue.severity} (line ${issue.line}): ${issue.message}`,
    ),
  ];
}

/** Check skills against the Agent Skills format. Exit code 1 when any skill has an error. */
async function validate(context: CommandContext): Promise<CommandResult> {
  const { core, args } = context;
  limitPositionals(args, 1);
  const ref = args.positionals[0];
  const all = flagBoolean(args, ALL_FLAG.name);
  if ((ref === undefined) === !all) throw new UsageError("Give one skill, or --all.");
  const skills = ref === undefined ? await core.api.skills.list() : [core.store.resolve(ref)];

  const flagged = ref === undefined ? skills.filter((skill) => skill.issues.length > 0) : skills;
  const broken = skills.filter((skill) => hasSkillErrors(skill.issues));
  const lines = flagged.flatMap(describe);
  if (ref === undefined) {
    lines.push(
      `Checked ${plural(skills.length, "skill")}: ${broken.length} with errors, ${
        flagged.length - broken.length
      } with warnings only.`,
    );
  }
  return {
    value: ref === undefined ? flagged.map(view) : view(skills[0] as Skill),
    text: lines.join("\n"),
    exitCode: broken.length > 0 ? 1 : 0,
  };
}

export const validateCommand: CommandSpec = {
  name: "validate",
  summary: "Check skills against the Agent Skills format",
  usage: "[<ref> | --all]",
  flags: [ALL_FLAG],
  notes: [
    "Errors (missing SKILL.md, frontmatter, name or description, or YAML that does not parse) exit with code 1. Warnings (naming rules, lengths, links to missing files) do not.",
  ],
  run: validate,
};
