import { groupSkillSources, skillsWithoutSource } from "@loadout/shared";
import { plural, table, when } from "../output";
import { limitPositionals } from "./support";
import type { CommandContext, CommandGroup, CommandResult } from "./types";

/** Where the library's skills came from: one line per repository, archive or link. */
async function list({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 0);
  const skills = await core.api.skills.list();
  const names = new Map(skills.map((skill) => [skill.id, skill.name]));
  const sources = groupSkillSources(skills);
  const value = sources.map((source) =>
    Object.assign(source, { skills: source.skillIds.map((id) => names.get(id) ?? id) }),
  );
  const loose = skillsWithoutSource(skills);
  const lines = [
    table(
      ["source", "kind", "skills", "updates", "checked", "location"],
      value.map((source) => [
        source.branch ? `${source.label}#${source.branch}` : source.label,
        source.kind,
        source.skills.length,
        source.updatesAvailable,
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

export const sourcesGroup: CommandGroup = {
  name: "sources",
  summary: "Where the library's skills came from",
  commands: [
    {
      name: "list",
      summary: "List repositories, archives and links, with skill and update counts",
      usage: "",
      flags: [],
      run: list,
    },
  ],
};
