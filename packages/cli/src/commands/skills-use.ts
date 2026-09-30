import { notFound } from "@loadout/core";
import type { GitPreview, PreviewedSkill, RepoSkillPreview, SafetyReport } from "@loadout/shared";
import { UsageError, flagBoolean, flagString } from "../args";
import { plural } from "../output";
import { ARCHIVE_SUFFIXES, classifySource, selectSkills } from "./skills-install";
import {
  ACCEPT_RISK_FLAG,
  YES_FLAG,
  limitPositionals,
  positional,
  resolveUserPath,
} from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

/**
 * `skills use <source>`: print one skill's `SKILL.md` without installing it, so it can be piped
 * straight into an agent (`loadout skills use owner/repo@pdf | claude`). The skill is fetched and
 * safety-checked exactly as an install would; nothing is written to the library.
 */

const SKILL_FLAG = {
  name: "skill",
  short: "s",
  type: "string",
  value: "name",
  description: "Skill to read when the source holds several.",
} as const;

const USE_RISK_FLAG = {
  ...ACCEPT_RISK_FLAG,
  description: "Print a skill the safety check flags anyway. Read the findings first.",
};

const USE_YES_FLAG = {
  ...YES_FLAG,
  description: "Read from a download that moved to another site than the link names.",
};

const FOLDER_HINT =
  "A folder is already on this computer: read its SKILL.md directly, or install it with `skills install`.";

/** The one skill a preview should give: named, the one the typed text asked for, or the only one. */
function pickSkill(preview: GitPreview, wanted: string | undefined): RepoSkillPreview {
  if (wanted !== undefined) {
    const [only] = selectSkills(preview.skills, [wanted], false, preview.kind);
    if (only) return only;
  }
  const asked = preview.skills.filter((skill) => preview.selected?.includes(skill.relPath));
  if (asked.length === 1 && asked[0]) return asked[0];
  if (preview.skills.length === 1 && preview.skills[0]) return preview.skills[0];
  if (preview.skills.length === 0) throw notFound(`No skills were found in that ${preview.kind}.`);
  const names = preview.skills.map((skill) => skill.name).join(", ");
  throw new UsageError(
    `That ${preview.kind} holds ${plural(preview.skills.length, "skill")}: ${names}. Pick one with --skill <name> or <source>@<name>.`,
  );
}

/** Read one skill of a preview; the preview is thrown away whatever happens. */
async function readFromPreview(
  context: CommandContext,
  preview: GitPreview,
  wanted: string | undefined,
): Promise<PreviewedSkill> {
  const { core, args } = context;
  try {
    if (preview.redirectedTo && !flagBoolean(args, USE_YES_FLAG.name)) {
      throw new UsageError(
        `The download moved to ${preview.redirectedTo}, another site than the link names. Add --yes to read it anyway.`,
      );
    }
    const skill = pickSkill(preview, wanted);
    const read = await core.api.install.readPreviewSkill(preview.previewId, skill.relPath, {
      acceptRisk: flagBoolean(args, USE_RISK_FLAG.name),
    });
    return { ...read, name: skill.name };
  } finally {
    await core.api.install.cancelPreview(preview.previewId).catch(() => undefined);
  }
}

/** One line for stderr when the check found anything; stdout stays the document alone. */
export function safetyNotice(name: string, report: SafetyReport | null): string | undefined {
  if (!report || report.verdict === "safe") return undefined;
  const found = report.findings.length;
  return `Safety check on ${name}: ${report.recommendation}, risk ${report.score}/100, ${plural(found, "finding")}. Run with --json to read them.`;
}

async function run(context: CommandContext): Promise<CommandResult> {
  const { core, args, cwd } = context;
  limitPositionals(args, 1);
  const input = positional(args, 0, "the skill to read");
  const source = classifySource(input);
  const wanted = flagString(args, SKILL_FLAG.name);
  const acceptRisk = flagBoolean(args, USE_RISK_FLAG.name);
  let read: PreviewedSkill;
  if (source.kind === "clawhub") {
    read = await core.api.install.readClawhubSkill(source.owner, source.slug, { acceptRisk });
  } else if (source.kind === "market") {
    // `owner/repo@skill` names a GitHub repository and one skill in it.
    const preview = await core.api.install.previewGit(source.source);
    read = await readFromPreview(context, preview, wanted ?? source.skillId);
  } else if (source.kind === "git") {
    read = await readFromPreview(context, await core.api.install.previewGit(source.url), wanted);
  } else {
    const path = resolveUserPath(source.path, cwd, core.ctx.homeDir);
    // Only archives are fetched; a folder is read where it is.
    if (!ARCHIVE_SUFFIXES.some((suffix) => path.toLowerCase().endsWith(suffix))) {
      throw new UsageError(FOLDER_HINT);
    }
    read = await readFromPreview(context, await core.api.install.previewArchive(path), wanted);
  }
  // printResult adds the final line break back.
  const text = read.document.endsWith("\n") ? read.document.slice(0, -1) : read.document;
  return {
    value: { source: input, ...read },
    text,
    notice: safetyNotice(read.name, read.safety),
  };
}

export const useCommand: CommandSpec = {
  name: "use",
  summary: "Print a skill's SKILL.md without installing it, to pipe into an agent",
  usage: "<source> [--skill <name>] [--yes] [--accept-risk]",
  flags: [SKILL_FLAG, USE_YES_FLAG, USE_RISK_FLAG],
  notes: [
    "Takes the same sources as `skills install`: owner/repo@skill, owner/repo, a git URL, a link,",
    "an archive, or @owner/slug for ClawHub. Nothing is added to the library.",
    "stdout is the document alone, so `skills use owner/repo@pdf | claude` works; safety notes",
    "go to stderr. A skill the safety check flags fails with UNSAFE; --accept-risk prints it.",
  ],
  run,
};
