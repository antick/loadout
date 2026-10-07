import { canonicalPath, isInside, notFound } from "@loadout/core";
import type { Project, ProjectSuggestions, SuggestionReason } from "@loadout/shared";
import { UsageError, flagBoolean, flagList, flagString } from "../args";
import { exitCodeFor } from "../exit-codes";
import { failureLines, plural, table } from "../output";
import { AGENT_FLAG, eachItem, limitPositionals, requireAgents, resolveUserPath } from "./support";
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
  const add = flagBoolean(args, ADD_FLAG.name);
  const agentKeys = flagList(args, AGENT_FLAG.name);
  // Checked before anything is read: an option that would be ignored is a mistake to point out.
  if (add && agentKeys.length === 0) {
    throw new UsageError(`--${ADD_FLAG.name} needs at least one --agent.`);
  }
  if (!add && agentKeys.length > 0)
    throw new UsageError(`--agent only works with --${ADD_FLAG.name}.`);
  // A typo or an agent not installed would otherwise be left out without a word.
  const agents = add ? requireAgents(core, args, true).map((agent) => agent.key) : [];
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

  if (!add) return { value: found, text: lines.join("\n") };
  const strong = found.suggestions.filter((s) => s.strength === "strong");
  const { done: added, failed } = await eachItem(
    strong,
    (suggestion) => nameOf(suggestion.skillId),
    async (suggestion) => {
      await core.api.projects.exportSkill(suggestion.skillId, project.id, agents);
      return nameOf(suggestion.skillId);
    },
  );
  if (added.length > 0) lines.push(`Added ${plural(added.length, "skill")}: ${added.join(", ")}`);
  else if (failed.length === 0) lines.push("Nothing strong enough to add.");
  lines.push(...failureLines(failed));
  return {
    value: { ...found, added, failed },
    text: lines.join("\n"),
    exitCode: exitCodeFor(failed.length > 0),
  };
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
