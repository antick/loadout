import { isArchivePath, skillMatchesName } from "@loadout/shared";
import {
  cancelled,
  notFound,
  parseSkillsCommand,
  planFolder,
  planMarket,
  planPreview,
  requireSkillFolder,
} from "@loadout/core";
import type {
  GitPreview,
  InstallSelection,
  RepoSkillPreview,
  SafetyReport,
  Skill,
  InstallPlan,
} from "@loadout/shared";
import { UsageError, flagBoolean, flagList, flagString } from "../args";
import { plural } from "../output";
import { planText } from "./skills-install-plan";
import {
  ACCEPT_RISK_FLAG,
  ALLOW_REDIRECT_FLAG,
  DRY_RUN_FLAG,
  limitPositionals,
  positional,
  resolveUserPath,
  allSkillsFlag,
} from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

export type InstallSource =
  | { kind: "path"; path: string }
  | { kind: "git"; url: string }
  | { kind: "market"; source: string; skillId: string }
  | { kind: "clawhub"; owner: string; slug: string };

const PATH_START = /^(?:~|\.{1,2}(?:[\\/]|$)|[\\/]|[A-Za-z]:[\\/])/;
const REPO = String.raw`[A-Za-z0-9_][\w.-]*\/[A-Za-z0-9_][\w.-]*`;
const SHORTHAND = new RegExp(`^${REPO}$`);
const MARKET_SKILL = new RegExp(`^(${REPO})[@/]([^\\s@/]+)$`);
/** `clawhub:owner/slug` or `@owner/slug`: a skill on the ClawHub registry. */
const CLAWHUB_SKILL = /^(?:clawhub:|@)([\w.-]+)\/([\w.-]+)$/i;
/** A first segment with a dot in it is a host name (`github.com/…`), not a GitHub owner. */
const HOST_FIRST = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+\/[^\s]+$/i;
/** `github:owner/repo`, `gitlab:group/repo`: the host named before the repository. */
const HOST_PREFIX = /^(?:github|gitlab):\S+$/i;
/**
 * `owner/repo#branch`, `owner/repo#branch@skill`, `owner/repo/path/in/repo[@skill]`: a branch or a
 * path core reads out of the text. One segment after the repository is a marketplace skill id.
 */
const SHORTHAND_MORE = new RegExp(`^${REPO}(?:#\\S+|(?:\\/[^\\s/@#]+){2,}(?:@[^\\s/@]+)?)$`);

/**
 * Decide what a source is from its spelling alone. Looking at the disk instead would make
 * `owner/repo` mean different things depending on the folder the command runs in.
 */
export function classifySource(input: string): InstallSource {
  const text = input.trim();
  const lower = text.toLowerCase();
  const clawhub = CLAWHUB_SKILL.exec(text);
  if (clawhub?.[1] && clawhub[2]) return { kind: "clawhub", owner: clawhub[1], slug: clawhub[2] };
  // A pasted `npx skills add …` names its source, skills and agents; core reads all of it.
  if (parseSkillsCommand(text)) return { kind: "git", url: text };
  if (text.includes("://") || text.startsWith("git@")) return { kind: "git", url: text };
  if (PATH_START.test(text) || isArchivePath(text)) {
    return { kind: "path", path: text };
  }
  // `github.com/owner/repo` is a web address without its scheme, never an `owner/repo@skill`.
  if (HOST_FIRST.test(text)) return { kind: "git", url: `https://${text}` };
  if (lower.endsWith(".git") || SHORTHAND.test(text)) return { kind: "git", url: text };
  const market = MARKET_SKILL.exec(text);
  if (market?.[1] && market[2]) return { kind: "market", source: market[1], skillId: market[2] };
  if (HOST_PREFIX.test(text) || SHORTHAND_MORE.test(text)) return { kind: "git", url: text };
  throw new UsageError(
    `Can not tell what "${text}" is. Use ./folder or ./file.zip for something on disk, a full git URL, owner/repo, owner/repo#branch, owner/repo@skill, or @owner/slug for ClawHub.`,
  );
}

/** Said after anything lands in the library. */
export const NOT_DEPLOYED_HINT =
  "Installing does not deploy. Next: skills deploy <ref> --agent <key>";

const REPLACE_FOLDER =
  "--replace works for repositories, links and archives. For a folder, delete the library skill first or pick another --name.";

/** Match `--skill` values against what the repository or archive really holds; never guess. */
export function selectSkills(
  available: readonly RepoSkillPreview[],
  wanted: readonly string[],
  all: boolean,
  what: GitPreview["kind"] = "repository",
): RepoSkillPreview[] {
  if (available.length === 0) throw notFound(`No skills were found in that ${what}.`);
  if (wanted.length === 0) {
    if (all || available.length === 1) return [...available];
    const names = available.map((skill) => skill.name).join(", ");
    throw new UsageError(
      `That ${what} holds ${plural(available.length, "skill")}: ${names}. Pick with --skill <name> (repeatable) or take everything with --all.`,
    );
  }
  return wanted.map((want) => {
    const match = available.find((skill) => skillMatchesName(skill, want));
    if (!match) throw notFound(`No skill called "${want}" in that ${what}.`);
    return match;
  });
}

const NAME_FLAG = {
  name: "name",
  type: "string",
  value: "name",
  description: "Library name for the skill (single skill only).",
} as const;
const SKILL_FLAG = {
  name: "skill",
  type: "list",
  value: "id",
  description: "Skill to take from a repository or archive. Repeat for several.",
} as const;
const REPLACE_FLAG = {
  name: "replace",
  type: "boolean",
  description: "When a library skill has the name, replace it instead of adding <name>-2.",
} as const;
const ALL_FLAG = allSkillsFlag("Take every skill the repository or archive holds.");

/**
 * The skills to install: named with `--skill`, all with `--all`, the only one, or (in a terminal a
 * person types in) ticked in the picker. Without a terminal an unclear choice stays an error.
 */
async function chooseSkills(
  context: CommandContext,
  preview: GitPreview,
): Promise<RepoSkillPreview[]> {
  const { args, picker } = context;
  const wanted = flagList(args, SKILL_FLAG.name);
  const all = flagBoolean(args, ALL_FLAG.name);
  // Skills the source text named (`owner/repo#dev@pdf`, a pasted `--skill pdf`) count as --skill.
  if (wanted.length === 0 && !all) {
    const [missing] = preview.missing;
    if (missing !== undefined)
      throw notFound(`No skill called "${missing}" in that ${preview.kind}.`);
    const named = preview.selected ?? [];
    if (named.length > 0) return preview.skills.filter((skill) => named.includes(skill.relPath));
  }
  if (!picker || wanted.length > 0 || all || preview.skills.length < 2) {
    return selectSkills(preview.skills, wanted, all, preview.kind);
  }
  const keys = await picker({
    source: preview.repoUrl,
    skills: preview.skills,
    library: preview.library,
    selected: preview.selected,
    replace: flagBoolean(args, REPLACE_FLAG.name),
  });
  if (!keys) throw cancelled("Cancelled. Nothing was installed.");
  return preview.skills.filter((skill) => keys.includes(skill.relPath));
}

/** What landed in the library, and the name each was asked to get (when one was). */
interface Installed {
  skills: Skill[];
  /** Same order as `skills`; empty when the source named the skill itself. */
  asked: string[];
  /** Names of library skills `--replace` put new versions in place of. */
  replaced: string[];
}

/** The chosen skills of a preview with the names they are installed under. */
async function chooseItems(
  context: CommandContext,
  preview: GitPreview,
): Promise<InstallSelection[]> {
  const name = flagString(context.args, NAME_FLAG.name);
  const chosen = await chooseSkills(context, preview);
  if (name !== undefined && chosen.length !== 1) {
    throw new UsageError("--name only works when exactly one skill is installed.");
  }
  const replace = flagBoolean(context.args, REPLACE_FLAG.name);
  return chosen.map((skill) => ({ relPath: skill.relPath, name: name ?? skill.name, replace }));
}

/**
 * The real install refuses a download that moved to another site unless the user accepted it;
 * its dry run refuses it the same way.
 */
function requireRedirectAccepted(context: CommandContext, preview: GitPreview): boolean {
  const acceptRedirect = flagBoolean(context.args, ALLOW_REDIRECT_FLAG.name);
  if (preview.redirectedTo && !acceptRedirect) {
    throw new UsageError(
      `The download moved to ${preview.redirectedTo}, another site than the link names. Add --${ALLOW_REDIRECT_FLAG.name} to install from it anyway.`,
    );
  }
  return acceptRedirect;
}

/**
 * What a preview would install, without installing it: the chosen skills go through the same
 * redirect and safety checks as the real install. The preview is always thrown away.
 */
async function planFromPreview(context: CommandContext, preview: GitPreview): Promise<InstallPlan> {
  const { core, args } = context;
  try {
    const items = await chooseItems(context, preview);
    requireRedirectAccepted(context, preview);
    const acceptRisk = flagBoolean(args, ACCEPT_RISK_FLAG.name);
    const safety = new Map<string, SafetyReport | null>();
    for (const item of items) {
      const read = await core.api.install.readPreviewSkill(preview.previewId, item.relPath, {
        acceptRisk,
      });
      safety.set(item.relPath, read.safety);
    }
    return planPreview(preview, items, safety);
  } finally {
    await core.api.install.cancelPreview(preview.previewId).catch(() => undefined);
  }
}

/** Install the chosen skills of a preview; the preview is cleaned up whatever happens. */
async function installFromPreview(
  context: CommandContext,
  preview: GitPreview,
): Promise<Installed> {
  const { core, args } = context;
  try {
    const items = await chooseItems(context, preview);
    const acceptRedirect = requireRedirectAccepted(context, preview);
    const skills = await core.api.install.confirmGit(preview.previewId, items, {
      acceptRedirect,
      acceptRisk: flagBoolean(args, ACCEPT_RISK_FLAG.name),
    });
    const held = new Set(preview.library.flatMap((entry) => entry.skillId ?? []));
    const replaced = skills
      .filter((skill, index) => items[index]?.replace && held.has(skill.id))
      .map((skill) => skill.name);
    return { skills, asked: items.map((item) => item.name), replaced };
  } catch (error) {
    // The temporary clone is ours to clean up when nothing got installed from it.
    await core.api.install.cancelPreview(preview.previewId).catch(() => undefined);
    throw error;
  }
}

/** A folder, or an archive file, which is picked from like a repository, as its dry run is. */
async function installFromPath(context: CommandContext, path: string): Promise<Installed> {
  const { core, args } = context;
  if (isArchivePath(path)) {
    return installFromPreview(context, await core.api.install.previewArchive(path));
  }
  const name = flagString(args, NAME_FLAG.name);
  const acceptRisk = flagBoolean(args, ACCEPT_RISK_FLAG.name);
  return {
    skills: [await core.api.install.fromPath(path, name, { acceptRisk })],
    asked: name === undefined ? [] : [name],
    replaced: [],
  };
}

/** Flags that pick from or rename what a source holds, which a single named skill does not take. */
const PICKING_FLAGS = [NAME_FLAG, SKILL_FLAG, ALL_FLAG, REPLACE_FLAG] as const;

/**
 * Refuse flags this kind of source cannot use, once, before the dry run and the real run part
 * ways: a flag that is quietly ignored would make the preview and the install disagree.
 */
function checkFlags(args: CommandContext["args"], source: InstallSource): void {
  const given = (flag: (typeof PICKING_FLAGS)[number]): boolean =>
    args.flags[flag.name] !== undefined;
  const named =
    source.kind === "market"
      ? "owner/repo@skill"
      : source.kind === "clawhub"
        ? "@owner/slug"
        : null;
  const unusable = named ? PICKING_FLAGS.find(given) : undefined;
  if (named && unusable) throw new UsageError(`--${unusable.name} is not supported for ${named}.`);
  if (source.kind !== "path" || isArchivePath(source.path)) return;
  if (given(REPLACE_FLAG)) throw new UsageError(REPLACE_FOLDER);
  if (given(SKILL_FLAG) || given(ALL_FLAG)) {
    throw new UsageError("--skill and --all pick from a repository or an archive, not a folder.");
  }
}

/**
 * `--dry-run`: fetch and safety-check what would be added, list it under the names it would get,
 * and install nothing. It refuses what the real install refuses.
 */
async function plan(context: CommandContext, source: InstallSource): Promise<InstallPlan> {
  const { core, args, cwd } = context;
  const acceptRisk = flagBoolean(args, ACCEPT_RISK_FLAG.name);
  if (source.kind === "clawhub") {
    const read = await core.api.install.readClawhubSkill(source.owner, source.slug, {
      acceptRisk,
    });
    const { owner: from, slug: skillId } = source;
    return planMarket(core.ctx, core.store, {
      source: from,
      skillId,
      sourceType: "clawhub",
      safety: read.safety,
    });
  }
  if (source.kind === "market") return planMarketSkill(context, source.source, source.skillId);
  if (source.kind === "git") {
    return planFromPreview(context, await core.api.install.previewGit(source.url));
  }
  const path = resolveUserPath(source.path, cwd, core.ctx.homeDir);
  if (isArchivePath(path)) {
    return planFromPreview(context, await core.api.install.previewArchive(path));
  }
  const read = await core.api.install.readFolderSkill(requireSkillFolder(path), { acceptRisk });
  return planFolder(core.ctx, core.store, path, flagString(args, NAME_FLAG.name), read.safety);
}

/** `owner/repo@skill`: the repository is fetched and the skill found and checked in it. */
async function planMarketSkill(
  context: CommandContext,
  source: string,
  skillId: string,
): Promise<InstallPlan> {
  const { core, args } = context;
  const preview = await core.api.install.previewGit(source);
  try {
    const [row] = selectSkills(preview.skills, [skillId], false, preview.kind);
    if (!row) throw notFound(`No skill called "${skillId}" in that ${preview.kind}.`);
    const read = await core.api.install.readPreviewSkill(preview.previewId, row.relPath, {
      acceptRisk: flagBoolean(args, ACCEPT_RISK_FLAG.name),
    });
    return planMarket(core.ctx, core.store, {
      source,
      skillId,
      sourceType: "marketplace",
      safety: read.safety,
      row,
    });
  } finally {
    await core.api.install.cancelPreview(preview.previewId).catch(() => undefined);
  }
}

async function run(context: CommandContext): Promise<CommandResult> {
  const { core, args, cwd } = context;
  limitPositionals(args, 1);
  const source = classifySource(positional(args, 0, "what to install"));
  checkFlags(args, source);
  if (flagBoolean(args, DRY_RUN_FLAG.name)) {
    const value = await plan(context, source);
    return { value, text: planText(value) };
  }
  let result: Installed;
  if (source.kind === "path") {
    result = await installFromPath(context, resolveUserPath(source.path, cwd, core.ctx.homeDir));
  } else if (source.kind === "market") {
    const skill = await core.api.install.fromMarket(source.source, source.skillId, {
      acceptRisk: flagBoolean(args, ACCEPT_RISK_FLAG.name),
    });
    result = { skills: [skill], asked: [], replaced: [] };
  } else if (source.kind === "clawhub") {
    const skill = await core.api.install.fromClawhub(source.owner, source.slug, {
      acceptRisk: flagBoolean(args, ACCEPT_RISK_FLAG.name),
    });
    result = { skills: [skill], asked: [], replaced: [] };
  } else {
    result = await installFromPreview(context, await core.api.install.previewGit(source.url));
  }
  const installed = result.skills;
  const lines = installed.map((skill) => `Installed ${skill.name} (${skill.id}) into the library.`);
  const renamed = installed.filter((skill, index) => {
    const asked = result.asked[index];
    return asked !== undefined && asked !== skill.dirName && !result.replaced.includes(skill.name);
  });
  if (result.replaced.length > 0) {
    lines.push(
      `Replaced in place: ${result.replaced.join(", ")}. A version that differed is in Recently removed.`,
    );
  }
  if (renamed.length > 0) {
    lines.push(
      `The name was in use, so these got a numbered name instead: ${renamed.map((s) => s.dirName).join(", ")}.`,
    );
  }
  lines.push(NOT_DEPLOYED_HINT);
  return { value: { dryRun: false, installed }, text: lines.join("\n") };
}

export const installCommand: CommandSpec = {
  name: "install",
  summary: "Add a skill to the library (does not deploy it)",
  usage: "<source>",
  flags: [
    NAME_FLAG,
    SKILL_FLAG,
    ALL_FLAG,
    REPLACE_FLAG,
    ALLOW_REDIRECT_FLAG,
    ACCEPT_RISK_FLAG,
    DRY_RUN_FLAG,
  ],
  notes: [
    "In a terminal, a source with several skills opens a picker to tick them; --skill or --all",
    "skip it, and scripts or --json never see it.",
    "--dry-run fetches and safety-checks the source and lists what would be added and under",
    "which names; it refuses what the real install refuses.",
    "Sources: ./folder, ./archive.zip (.skill, .tar, .tar.gz, .tgz), a git URL, owner/repo,",
    "owner/repo#branch, owner/repo/path/in/repo, github:owner/repo, a pasted",
    "`npx skills add …` command, @owner/slug for a ClawHub skill,",
    "owner/repo@skill, a link to an archive or a SKILL.md, or a site that publishes skills",
    "(https://example.com, read from /.well-known/agent-skills/index.json).",
    "--allow-redirect accepts a download that moved to another site than the link names.",
    "--replace puts a skill in place of the library skill holding its name, keeping its tags,",
    "presets and agents; the old version goes to Recently removed.",
    'Every skill is safety-checked first, unless "Check skills before installing" is off in',
    "the app's Settings; a flagged one fails with UNSAFE and its findings. --accept-risk installs",
    "it anyway.",
    "A folder must start with ./, ../, / or ~/ - a bare owner/repo always means GitHub.",
  ],
  run,
};
