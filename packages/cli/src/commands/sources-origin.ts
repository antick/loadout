import {
  type Skill,
  type SourceCandidate,
  type SourceSearch,
  needsSourceSearch,
} from "@loadout/shared";
import { UsageError, flagBoolean } from "../args";
import { plural, table } from "../output";
import { YES_FLAG, limitPositionals, positional, positionalsFrom, resolveSkills } from "./support";
import type { CommandContext, CommandResult, LibraryCommandSpec } from "./types";

/**
 * Finding where skills without a source came from, linking them to it, and marking the ones the
 * user wrote so nobody looks again.
 */

const UNDO_FLAG = {
  name: "undo",
  type: "boolean",
  description: "Take the mark away again.",
} as const;

const MATCH_TEXT: Record<SourceCandidate["match"], (candidate: SourceCandidate) => string> = {
  identical: () => "same files",
  similar: (candidate) => `differs in ${plural(candidate.changedFiles.length, "file")}`,
  different: (candidate) => `${Math.round(candidate.similarity * 100)}% alike`,
};

const EVIDENCE_TEXT: Record<SourceCandidate["evidence"], string> = {
  skills_lock: "npx skills lock file",
  git_folder: "git checkout",
  skill_link: "SKILL.md link",
  marketplace: "marketplace",
  pasted: "given",
};

const describeMatch = (candidate: SourceCandidate): string =>
  MATCH_TEXT[candidate.match](candidate);

/** Where the candidate points, as `link` accepts it back. */
function whereOf(candidate: SourceCandidate): string {
  const folder = candidate.subpath ? `/${candidate.subpath}` : "";
  return `${candidate.label}${folder}${candidate.branch ? `#${candidate.branch}` : ""}`;
}

/** Look for the sources of the named skills, or of every skill that has none. */
async function find({ core, args }: CommandContext): Promise<CommandResult> {
  const named = args.positionals.length > 0;
  const skills = named
    ? resolveSkills(core, args.positionals)
    : (await core.api.skills.list()).filter(needsSourceSearch);
  const value: (SourceSearch & { name: string })[] = [];
  for (const skill of skills) {
    value.push({ ...(await core.api.updates.findSource(skill.id)), name: skill.name });
  }
  const rows = value.flatMap((search) =>
    search.candidates.length === 0
      ? [[search.name, "none found", "", ""]]
      : search.candidates.map((candidate) => [
          search.name,
          describeMatch(candidate),
          whereOf(candidate),
          EVIDENCE_TEXT[candidate.evidence],
        ]),
  );
  const lines = [
    table(
      ["skill", "match", "source", "found by"],
      rows,
      "Every skill has a source or is marked as yours.",
    ),
  ];
  const failures = value.flatMap((search) =>
    search.failures.map((failure) => `${search.name}: ${failure}`),
  );
  if (failures.length > 0) lines.push(`Could not look everywhere:\n${failures.join("\n")}`);
  if (rows.length > 0) {
    lines.push("Link one: sources link <skill> [<repository>]. Yours: sources mine <skill>.");
  }
  return { value, text: lines.join("\n") };
}

/**
 * The candidate to link: the repository named on the command line, else the best one found.
 * Refused without `--yes` when its files differ from the library copy.
 */
async function chooseCandidate(
  context: CommandContext,
  skill: Skill,
  repository: string | undefined,
): Promise<SourceCandidate> {
  const { core, args } = context;
  let candidate: SourceCandidate | undefined;
  if (repository) {
    candidate = await core.api.updates.lookUpSource(skill.id, repository);
  } else {
    candidate = (await core.api.updates.findSource(skill.id)).candidates[0];
    if (!candidate) {
      throw new UsageError(
        `No source found for ${skill.name}. Name the repository: sources link ${skill.name} <repository>`,
      );
    }
  }
  if (candidate.match !== "identical" && !flagBoolean(args, YES_FLAG.name)) {
    throw new UsageError(
      `${skill.name} is not the same as ${whereOf(candidate)}: ${describeMatch(candidate)}` +
        `${candidate.changedFiles.length > 0 ? ` (${candidate.changedFiles.join(", ")})` : ""}. ` +
        "Add --yes to link it anyway: it then shows an update, and updating asks before replacing those files.",
    );
  }
  return candidate;
}

async function link(context: CommandContext): Promise<CommandResult> {
  const { core, args } = context;
  limitPositionals(args, 2);
  const [skill] = resolveSkills(core, [positional(args, 0, "a skill")]);
  if (!skill) throw new UsageError("Missing a skill.");
  const candidate = await chooseCandidate(context, skill, args.positionals[1]);
  const linked = await core.api.updates.attachSource(skill.id, candidate);
  const lines = [`${linked.name} now follows ${whereOf(candidate)}.`];
  if (candidate.match !== "identical") {
    lines.push("It shows an update: skills update asks before replacing the files that differ.");
  }
  return { value: { skill: linked, candidate }, text: lines.join("\n") };
}

async function mine({ core, args }: CommandContext): Promise<CommandResult> {
  const undo = flagBoolean(args, UNDO_FLAG.name);
  const skills = resolveSkills(core, positionalsFrom(args, 0, "a skill"));
  const value: Skill[] = [];
  for (const skill of skills) {
    // A source that no longer has the skill is forgotten first: it can never be updated from.
    const gone = !undo && skill.updateStatus === "source_missing";
    value.push(
      gone
        ? await core.api.updates.detach(skill.id, { markAuthored: true })
        : await core.api.skills.setAuthored(skill.id, !undo),
    );
  }
  const names = value.map((skill) => skill.name).join(", ");
  return {
    value,
    text: undo ? `No longer marked as yours: ${names}.` : `Marked as yours: ${names}.`,
  };
}

export const originCommands: readonly LibraryCommandSpec[] = [
  {
    name: "find",
    summary: "Look for where skills without a source came from",
    usage: "[<skill>…]",
    flags: [],
    notes: [
      "Looks in the Git checkout a skill was imported from, repositories its SKILL.md links",
      "to, and the marketplace, and compares each with the library copy. Changes nothing.",
      "Without skills named, looks for every skill without a source not marked as yours.",
    ],
    run: find,
  },
  {
    name: "link",
    summary: "Make a skill without a source follow a repository",
    usage: "<skill> [<repository>] [--yes]",
    flags: [YES_FLAG],
    notes: [
      "Without a repository, links the best match `sources find` shows. The skill's files",
      "stay as they are. A copy that differs needs --yes; it then shows an update, and",
      "updating asks before replacing the files that differ.",
    ],
    run: link,
  },
  {
    name: "mine",
    summary: "Mark skills as your own, so no source is looked for",
    usage: "<skill>… [--undo]",
    flags: [UNDO_FLAG],
    notes: [
      "A skill whose source no longer has it (Source missing) forgets that source first;",
      "its files and deployments stay as they are.",
    ],
    run: mine,
  },
];
