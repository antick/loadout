import { notFound } from "@loadout/core";
import type { GitPreview, InstallSelection, RepoSkillPreview, Skill } from "@loadout/shared";
import { UsageError, flagBoolean, flagList, flagString } from "../args";
import { plural } from "../output";
import { YES_FLAG, limitPositionals, positional, resolveUserPath } from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

export type InstallSource =
  | { kind: "path"; path: string }
  | { kind: "git"; url: string }
  | { kind: "market"; source: string; skillId: string };

const ARCHIVE_SUFFIXES = [".zip", ".skill", ".tar.gz", ".tgz", ".tar"] as const;
const PATH_START = /^(?:~|\.{1,2}(?:[\\/]|$)|[\\/]|[A-Za-z]:[\\/])/;
const REPO = String.raw`[A-Za-z0-9_][\w.-]*\/[A-Za-z0-9_][\w.-]*`;
const SHORTHAND = new RegExp(`^${REPO}$`);
const MARKET_SKILL = new RegExp(`^(${REPO})[@/]([^\\s@/]+)$`);

/**
 * Decide what a source is from its spelling alone. Looking at the disk instead would make
 * `owner/repo` mean different things depending on the folder the command runs in.
 */
export function classifySource(input: string): InstallSource {
  const text = input.trim();
  const lower = text.toLowerCase();
  if (text.includes("://") || text.startsWith("git@")) return { kind: "git", url: text };
  if (PATH_START.test(text) || ARCHIVE_SUFFIXES.some((suffix) => lower.endsWith(suffix))) {
    return { kind: "path", path: text };
  }
  if (lower.endsWith(".git") || SHORTHAND.test(text)) return { kind: "git", url: text };
  const market = MARKET_SKILL.exec(text);
  if (market?.[1] && market[2]) return { kind: "market", source: market[1], skillId: market[2] };
  throw new UsageError(
    `Can not tell what "${text}" is. Use ./folder or ./file.zip for something on disk, a full git URL, owner/repo, or owner/repo@skill.`,
  );
}

function lastSegment(relPath: string): string {
  return relPath.split("/").findLast(Boolean) ?? relPath;
}

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
const ALL_FLAG = {
  name: "all",
  type: "boolean",
  description: "Take every skill the repository or archive holds.",
} as const;

/** Install the chosen skills of a preview; the preview is cleaned up whatever happens. */
async function installFromPreview(context: CommandContext, preview: GitPreview): Promise<Skill[]> {
  const { core, args } = context;
  const name = flagString(args, NAME_FLAG.name);
  try {
    const chosen = selectSkills(
      preview.skills,
      flagList(args, SKILL_FLAG.name),
      flagBoolean(args, ALL_FLAG.name),
      preview.kind,
    );
    if (name !== undefined && chosen.length !== 1) {
      throw new UsageError("--name only works when exactly one skill is installed.");
    }
    const items: InstallSelection[] = chosen.map((skill) => ({
      relPath: skill.relPath,
      name: name ?? skill.name,
    }));
    const acceptRedirect = flagBoolean(args, YES_FLAG.name);
    if (preview.redirectedTo && !acceptRedirect) {
      throw new UsageError(
        `The download moved to ${preview.redirectedTo}, another site than the link names. Add --yes to install from it anyway.`,
      );
    }
    return await core.api.install.confirmGit(preview.previewId, items, { acceptRedirect });
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
async function installFromPath(context: CommandContext, path: string): Promise<Skill[]> {
  const { core, args } = context;
  const name = flagString(args, NAME_FLAG.name);
  if (ARCHIVE_SUFFIXES.some((suffix) => path.toLowerCase().endsWith(suffix))) {
    const preview = await core.api.install.previewArchive(path);
    if (preview.skills.length > 1) return installFromPreview(context, preview);
    await core.api.install.cancelPreview(preview.previewId);
  }
  return [await core.api.install.fromPath(path, name)];
}

async function run(context: CommandContext): Promise<CommandResult> {
  const { core, args, cwd } = context;
  limitPositionals(args, 1);
  const source = classifySource(positional(args, 0, "what to install"));
  const name = flagString(args, NAME_FLAG.name);
  let installed: Skill[];
  if (source.kind === "path") {
    installed = await installFromPath(context, resolveUserPath(source.path, cwd, core.ctx.homeDir));
  } else if (source.kind === "market") {
    if (name !== undefined) throw new UsageError("--name is not supported for owner/repo@skill.");
    installed = [await core.api.install.fromMarket(source.source, source.skillId)];
  } else {
    installed = await installFromPreview(context, await core.api.install.previewGit(source.url));
  }
  const lines = installed.map((skill) => `Installed ${skill.name} (${skill.id}) into the library.`);
  lines.push("Installing does not deploy. Next: skills deploy <ref> --agent <key>");
  return { value: { installed }, text: lines.join("\n") };
}

export const installCommand: CommandSpec = {
  name: "install",
  summary: "Add a skill to the library (does not deploy it)",
  usage: "<source> [--name <name>] [--skill <id>…] [--all] [--yes]",
  flags: [NAME_FLAG, SKILL_FLAG, ALL_FLAG, YES_FLAG],
  notes: [
    "Sources: ./folder, ./archive.zip (.skill, .tar, .tar.gz, .tgz), a git URL, owner/repo,",
    "owner/repo@skill, a link to an archive or a SKILL.md, or a site that publishes skills",
    "(https://example.com, read from /.well-known/agent-skills/index.json).",
    "--yes also accepts a download that moved to another site than the link names.",
    "A folder must start with ./, ../, / or ~/ - a bare owner/repo always means GitHub.",
  ],
  run,
};
