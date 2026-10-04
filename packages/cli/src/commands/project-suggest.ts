import { canonicalPath, isInside, notFound } from "@loadout/core";
import type { Project, ProjectSuggestions, SuggestionReason } from "@loadout/shared";
import { UsageError, flagBoolean, flagList, flagString } from "../args";
import { plural, table } from "../output";
import { AGENT_FLAG, limitPositionals, resolveUserPath } from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

const DIR_FLAG = {
  name: "dir",
  type: "string",
  value: "path",
  description: "A folder in the project. Default: this folder.",
} as const;
const ADD_FLAG = {
  name: "add",
  type: "boolean",
  description: "Add the strong suggestions to the project's folders for each --agent.",
} as const;

/** The linked project holding `dir`: the one whose folder is closest above it. */
async function projectAt(context: CommandContext): Promise<Project> {
  const input = flagString(context.args, DIR_FLAG.name);
  const dir = canonicalPath(
    input === undefined
      ? context.cwd
      : resolveUserPath(input, context.cwd, context.core.ctx.homeDir),
  );
  const holding = (await context.core.api.projects.list())
    .filter((project) => isInside(canonicalPath(project.path), dir))
    .sort((a, b) => b.path.length - a.path.length);
  const [project] = holding;
  if (!project) {
    throw notFound(`${dir} is not in a linked project. Link it in the app (Projects) first.`);
  }
  return project;
}

function reasonText(reason: SuggestionReason): string {
  if (reason.kind === "pattern") {
    return reason.pattern === reason.match
      ? `has ${reason.match}`
      : `has ${reason.match} (${reason.pattern})`;
  }
  return reason.where === "description" ? `mentions ${reason.tech}` : `for ${reason.tech}`;
}

/** Library skills worth adding to the project, and why; `--add` puts the strong ones in. */
async function suggest(context: CommandContext): Promise<CommandResult> {
  const { core, args } = context;
  limitPositionals(args, 0);
  const project = await projectAt(context);
  const found: ProjectSuggestions = await core.api.projects.suggestSkills(project.id);
  const skills = new Map((await core.api.skills.list()).map((skill) => [skill.id, skill]));
  const nameOf = (id: string): string => skills.get(id)?.name ?? id;

  const lines = [
    `Project: ${project.path}`,
    `Uses: ${found.technologies.length > 0 ? found.technologies.join(", ") : "nothing Loadout recognises"}`,
    table(
      ["skill", "why", "fit"],
      found.suggestions.map((s) => [
        nameOf(s.skillId),
        s.reasons.map(reasonText).join("; "),
        s.strength === "strong" ? "good" : "maybe",
      ]),
      "No library skill fits this project that it does not have already.",
    ),
  ];
  if (found.dismissed.length > 0) {
    lines.push(`Not suggested here, by your choice: ${found.dismissed.map(nameOf).join(", ")}`);
  }

  if (!flagBoolean(args, ADD_FLAG.name)) {
    return { value: found, text: lines.join("\n") };
  }
  const agents = flagList(args, AGENT_FLAG.name);
  if (agents.length === 0) throw new UsageError(`--${ADD_FLAG.name} needs at least one --agent.`);
  const strong = found.suggestions.filter((s) => s.strength === "strong");
  const added: string[] = [];
  for (const suggestion of strong) {
    await core.api.projects.exportSkill(suggestion.skillId, project.id, agents);
    added.push(nameOf(suggestion.skillId));
  }
  lines.push(
    added.length > 0
      ? `Added ${plural(added.length, "skill")}: ${added.join(", ")}`
      : "Nothing strong enough to add.",
  );
  return { value: { ...found, added }, text: lines.join("\n") };
}

export const suggestCommand: CommandSpec = {
  name: "suggest",
  summary: "Library skills that fit a linked project, from its files",
  usage: "[--add --agent <key>…]",
  flags: [DIR_FLAG, ADD_FLAG, AGENT_FLAG],
  notes: [
    "A skill fits when a file pattern set on it matches (skills suggest-for), or when it names a technology the project uses (React, Python, Docker…).",
    "'good' fits come from a pattern, or the technology in the skill's name or tags; 'maybe' ones only mention it.",
  ],
  run: suggest,
};
