import { notFound } from "@loadout/core";
import {
  type SkillSource,
  type SourceNews,
  groupSkillSources,
  skillsWithoutSource,
} from "@loadout/shared";
import { flagList } from "../args";
import { plural, table, when } from "../output";
import { limitPositionals, positional } from "./support";
import type { CommandContext, CommandGroup, CommandResult } from "./types";

const PATH_FLAG = {
  name: "path",
  type: "list",
  value: "path",
  description: "Only this new skill (its folder in the repository). Repeat for several.",
} as const;

/** How a source is named on the command line: as `sources list` shows it, or its key or address. */
function sourceName(source: SkillSource): string {
  return source.branch ? `${source.label}#${source.branch}` : source.label;
}

function findSource(sources: readonly SkillSource[], text: string): SkillSource {
  const found = sources.find(
    (source) =>
      source.kind === "repository" &&
      [source.key, sourceName(source), source.location].includes(text),
  );
  if (!found) {
    throw notFound(`No repository called "${text}" among the sources. See: sources list`);
  }
  return found;
}

function newCount(news: readonly SourceNews[], key: string): number {
  return news.find((entry) => entry.sourceKey === key)?.skills.length ?? 0;
}

/** Where the library's skills came from: one line per repository, archive or link. */
async function list({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 0);
  const skills = await core.api.skills.list();
  const news = await core.api.updates.sourceNews();
  const names = new Map(skills.map((skill) => [skill.id, skill.name]));
  const sources = groupSkillSources(skills);
  const value = sources.map((source) =>
    Object.assign(source, {
      skills: source.skillIds.map((id) => names.get(id) ?? id),
      newSkills: news.find((entry) => entry.sourceKey === source.key)?.skills ?? [],
    }),
  );
  const loose = skillsWithoutSource(skills);
  const lines = [
    table(
      ["source", "kind", "skills", "updates", "new", "checked", "location"],
      value.map((source) => [
        sourceName(source),
        source.kind,
        source.skills.length,
        source.updatesAvailable,
        source.newSkills.length,
        when(source.lastCheckedAt),
        source.location,
      ]),
      "No sources yet: nothing was installed from a repository, an archive or a link.",
    ),
  ];
  if (loose > 0) {
    lines.push(`${plural(loose, "skill")} made here or imported from a folder not listed.`);
  }
  if (value.length > 0) {
    lines.push(
      "To see what else a source offers: skills install <location> (the picker marks what you have).",
    );
  }
  return { value, text: lines.join("\n") };
}

/** Look at repositories for skills they gained; adds them when the app's setting says so. */
async function check({ core, args }: CommandContext): Promise<CommandResult> {
  const wanted = args.positionals;
  const sources = groupSkillSources(await core.api.skills.list());
  const keys = wanted.length > 0 ? wanted.map((text) => findSource(sources, text).key) : undefined;
  const result = await core.api.updates.checkSources(keys);
  const shown = keys ? result.news.filter((entry) => keys.includes(entry.sourceKey)) : result.news;
  const rows = shown.flatMap((entry) => {
    const source = sources.find((candidate) => candidate.key === entry.sourceKey);
    const name = source ? sourceName(source) : entry.sourceKey;
    return entry.skills.map((skill) => [name, skill.name, skill.path]);
  });
  const lines = [table(["source", "new skill", "path"], rows, "Nothing new in these sources.")];
  if (result.added.length > 0) lines.push(`Added to the library: ${result.added.join(", ")}.`);
  for (const failure of result.failed)
    lines.push(`Could not check ${failure.name}: ${failure.message}`);
  if (rows.length > 0) {
    lines.push(
      "Add them: skills install <location> --skill <name>. Stop showing them: sources dismiss <source>.",
    );
  }
  return { value: { ...result, news: shown }, text: lines.join("\n") };
}

/** Stop showing a repository's new skills: all of them, or the ones named with `--path`. */
async function dismiss(context: CommandContext): Promise<CommandResult> {
  const { core, args } = context;
  limitPositionals(args, 1);
  const source = findSource(
    groupSkillSources(await core.api.skills.list()),
    positional(args, 0, "a repository from `sources list`"),
  );
  const paths = flagList(args, PATH_FLAG.name);
  const before = newCount(await core.api.updates.sourceNews(), source.key);
  await core.api.updates.dismissSourceNews(source.key, paths.length > 0 ? paths : undefined);
  const left = newCount(await core.api.updates.sourceNews(), source.key);
  return {
    value: { source: source.key, dismissed: before - left, left },
    text: `No longer showing ${plural(before - left, "new skill")} of ${sourceName(source)}.`,
  };
}

export const sourcesGroup: CommandGroup = {
  name: "sources",
  summary: "Where the library's skills came from",
  commands: [
    {
      name: "list",
      summary: "List repositories, archives and links, with skill, update and new-skill counts",
      usage: "",
      flags: [],
      run: list,
    },
    {
      name: "check",
      summary: "Look for skills repositories gained since you last looked",
      usage: "[<repository>…]",
      flags: [],
      notes: [
        "Checks every repository when none is named. The first look at a repository takes",
        "what is there as known; skills skipped in an import or dismissed stay quiet.",
        "With 'Add new skills from sources' on in the app's Settings, new skills are added",
        "(after the safety check); a name already in use is left for you.",
      ],
      run: check,
    },
    {
      name: "dismiss",
      summary: "Stop showing a repository's new skills",
      usage: "<repository> [--path <path>…]",
      flags: [PATH_FLAG],
      run: dismiss,
    },
  ],
};
