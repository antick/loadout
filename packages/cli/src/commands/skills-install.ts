import { cancelled, notFound } from "@loadout/core";
import type { GitPreview, InstallSelection, RepoSkillPreview, Skill } from "@loadout/shared";
import { UsageError, flagBoolean, flagList, flagString } from "../args";
import { plural } from "../output";
import {
  type InstallPlan,
  planFolder,
  planMarket,
  planPreview,
  planText,
} from "./skills-install-plan";
import {
  ACCEPT_RISK_FLAG,
  DRY_RUN_FLAG,
  YES_FLAG,
  limitPositionals,
  positional,
  resolveUserPath,
} from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

export type InstallSource =
  | { kind: "path"; path: string }
  | { kind: "git"; url: string }
  | { kind: "market"; source: string; skillId: string }
  | { kind: "clawhub"; owner: string; slug: string };

export const ARCHIVE_SUFFIXES = [".zip", ".skill", ".tar.gz", ".tgz", ".tar"] as const;
const PATH_START = /^(?:~|\.{1,2}(?:[\\/]|$)|[\\/]|[A-Za-z]:[\\/])/;
const REPO = String.raw`[A-Za-z0-9_][\w.-]*\/[A-Za-z0-9_][\w.-]*`;
const SHORTHAND = new RegExp(`^${REPO}$`);
const MARKET_SKILL = new RegExp(`^(${REPO})[@/]([^\\s@/]+)$`);
/** `clawhub:owner/slug` or `@owner/slug`: a skill on the ClawHub registry. */
const CLAWHUB_SKILL = /^(?:clawhub:|@)([\w.-]+)\/([\w.-]+)$/i;
/** A first segment with a dot in it is a host name (`github.com/…`), not a GitHub owner. */
const HOST_FIRST = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+\/[^\s]+$/i;

/**
 * Decide what a source is from its spelling alone. Looking at the disk instead would make
 * `owner/repo` mean different things depending on the folder the command runs in.
 */
export function classifySource(input: string): InstallSource {
  const text = input.trim();
  const lower = text.toLowerCase();
  const clawhub = CLAWHUB_SKILL.exec(text);
  if (clawhub?.[1] && clawhub[2]) return { kind: "clawhub", owner: clawhub[1], slug: clawhub[2] };
  if (text.includes("://") || text.startsWith("git@")) return { kind: "git", url: text };
  if (PATH_START.test(text) || ARCHIVE_SUFFIXES.some((suffix) => lower.endsWith(suffix))) {
    return { kind: "path", path: text };
  }
  // `github.com/owner/repo` is a web address without its scheme, never an `owner/repo@skill`.
  if (HOST_FIRST.test(text)) return { kind: "git", url: `https://${text}` };
  if (lower.endsWith(".git") || SHORTHAND.test(text)) return { kind: "git", url: text };
  const market = MARKET_SKILL.exec(text);
  if (market?.[1] && market[2]) return { kind: "market", source: market[1], skillId: market[2] };
  throw new UsageError(
    `Can not tell what "${text}" is. Use ./folder or ./file.zip for something on disk, a full git URL, owner/repo, owner/repo@skill, or @owner/slug for ClawHub.`,
  );
}

function lastSegment(relPath: string): string {
  return relPath.split("/").findLast(Boolean) ?? relPath;
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
    const key = want.toLowerCase();
    const match = available.find(
      (skill) =>
        skill.relPath === want ||
        skill.name.toLowerCase() === key ||
        lastSegment(skill.relPath).toLowerCase() === key,
    );
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
const ALL_FLAG = {
  name: "all",
  type: "boolean",
  description: "Take every skill the repository or archive holds.",
} as const;

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

/** What a preview would install, without installing it; the preview is always thrown away. */
async function planFromPreview(context: CommandContext, preview: GitPreview): Promise<InstallPlan> {
  try {
    return planPreview(preview, await chooseItems(context, preview));
  } finally {
    await context.core.api.install.cancelPreview(preview.previewId).catch(() => undefined);
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
    const acceptRedirect = flagBoolean(args, YES_FLAG.name);
    if (preview.redirectedTo && !acceptRedirect) {
      throw new UsageError(
        `The download moved to ${preview.redirectedTo}, another site than the link names. Add --yes to install from it anyway.`,
      );
    }
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

/**
 * A folder or an archive file. An archive holding several skills is picked from like a
 * repository; anything else installs as one skill, exactly as before.
 */
async function installFromPath(context: CommandContext, path: string): Promise<Installed> {
  const { core, args } = context;
  const name = flagString(args, NAME_FLAG.name);
  const replace = flagBoolean(args, REPLACE_FLAG.name);
  if (ARCHIVE_SUFFIXES.some((suffix) => path.toLowerCase().endsWith(suffix))) {
    const preview = await core.api.install.previewArchive(path);
    // Replacing goes through the preview, which knows which library skill holds the name.
    if (preview.skills.length > 1 || replace) return installFromPreview(context, preview);
    await core.api.install.cancelPreview(preview.previewId);
  } else if (replace) {
    throw new UsageError(REPLACE_FOLDER);
  }
  const acceptRisk = flagBoolean(args, ACCEPT_RISK_FLAG.name);
  return {
    skills: [await core.api.install.fromPath(path, name, { acceptRisk })],
    asked: [],
    replaced: [],
  };
}

/** `--dry-run`: fetch and list what would be added, under which names; install nothing. */
async function plan(context: CommandContext, source: InstallSource): Promise<InstallPlan> {
  const { core, args, cwd } = context;
  const name = flagString(args, NAME_FLAG.name);
  if (source.kind === "clawhub") {
    return planMarket(core, source.owner, source.slug, "clawhub");
  }
  if (source.kind === "market") {
    if (name !== undefined) throw new UsageError("--name is not supported for owner/repo@skill.");
    return planMarket(core, source.source, source.skillId);
  }
  if (source.kind === "git") {
    return planFromPreview(context, await core.api.install.previewGit(source.url));
  }
  const path = resolveUserPath(source.path, cwd, core.ctx.homeDir);
  if (!ARCHIVE_SUFFIXES.some((suffix) => path.toLowerCase().endsWith(suffix))) {
    if (flagBoolean(args, REPLACE_FLAG.name)) throw new UsageError(REPLACE_FOLDER);
    return planFolder(core, path, name);
  }
  return planFromPreview(context, await core.api.install.previewArchive(path));
}

async function run(context: CommandContext): Promise<CommandResult> {
  const { core, args, cwd } = context;
  limitPositionals(args, 1);
  const source = classifySource(positional(args, 0, "what to install"));
  if (flagBoolean(args, DRY_RUN_FLAG.name)) {
    const value = await plan(context, source);
    return { value, text: planText(value) };
  }
  const name = flagString(args, NAME_FLAG.name);
  let result: Installed;
  if (source.kind === "path") {
    result = await installFromPath(context, resolveUserPath(source.path, cwd, core.ctx.homeDir));
  } else if (source.kind === "market") {
    if (name !== undefined) throw new UsageError("--name is not supported for owner/repo@skill.");
    const skill = await core.api.install.fromMarket(source.source, source.skillId, {
      acceptRisk: flagBoolean(args, ACCEPT_RISK_FLAG.name),
    });
    result = { skills: [skill], asked: [], replaced: [] };
  } else if (source.kind === "clawhub") {
    if (name !== undefined) throw new UsageError("--name is not supported for @owner/slug.");
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
    return asked !== undefined && asked !== skill.name && !result.replaced.includes(skill.name);
  });
  if (result.replaced.length > 0) {
    lines.push(
      `Replaced in place: ${result.replaced.join(", ")}. A version that differed is in Recently removed.`,
    );
  }
  if (renamed.length > 0) {
    lines.push(
      `The name was in use, so these got a numbered name instead: ${renamed.map((s) => s.name).join(", ")}.`,
    );
  }
  lines.push(NOT_DEPLOYED_HINT);
  return { value: { installed }, text: lines.join("\n") };
}

export const installCommand: CommandSpec = {
  name: "install",
  summary: "Add a skill to the library (does not deploy it)",
  usage:
    "<source> [--name <name>] [--skill <id>…] [--all] [--replace] [--yes] [--accept-risk] [--dry-run]",
  flags: [NAME_FLAG, SKILL_FLAG, ALL_FLAG, REPLACE_FLAG, YES_FLAG, ACCEPT_RISK_FLAG, DRY_RUN_FLAG],
  notes: [
    "In a terminal, a source with several skills opens a picker to tick them; --skill or --all",
    "skip it, and scripts or --json never see it.",
    "--dry-run fetches the source and lists what would be added and under which names.",
    "Sources: ./folder, ./archive.zip (.skill, .tar, .tar.gz, .tgz), a git URL, owner/repo,",
    "@owner/slug for a ClawHub skill,",
    "owner/repo@skill, a link to an archive or a SKILL.md, or a site that publishes skills",
    "(https://example.com, read from /.well-known/agent-skills/index.json).",
    "--yes also accepts a download that moved to another site than the link names.",
    "--replace puts a skill in place of the library skill holding its name, keeping its tags,",
    "presets and agents; the old version goes to Recently removed.",
    "With SkillSpector installed, skills are safety-checked first; a flagged one fails with",
    "UNSAFE and its findings. --accept-risk installs it anyway.",
    "A folder must start with ./, ../, / or ~/ - a bare owner/repo always means GitHub.",
  ],
  run,
};
