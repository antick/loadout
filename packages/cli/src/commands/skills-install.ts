import { notFound } from "@skillboard/core";
import type { InstallSelection, RepoSkillPreview, Skill } from "@skillboard/shared";
import { UsageError, flagBoolean, flagList, flagString } from "../args";
import { plural } from "../output";
import { limitPositionals, positional, resolveUserPath } from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

export type InstallSource =
  | { kind: "path"; path: string }
  | { kind: "git"; url: string }
  | { kind: "market"; source: string; skillId: string };

const ARCHIVE_SUFFIXES = [".zip", ".skill"] as const;
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

/** Match `--skill` values against what the repository really holds; never guess. */
export function selectSkills(
  available: readonly RepoSkillPreview[],
  wanted: readonly string[],
  all: boolean,
): RepoSkillPreview[] {
  if (available.length === 0) throw notFound("No skills were found in that repository.");
  if (wanted.length === 0) {
    if (all || available.length === 1) return [...available];
    const names = available.map((skill) => skill.name).join(", ");
    throw new UsageError(
      `That repository holds ${plural(available.length, "skill")}: ${names}. Pick with --skill <name> (repeatable) or take everything with --all.`,
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
    if (!match) throw notFound(`No skill called "${want}" in that repository.`);
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
  description: "Skill to take from a repository. Repeat for several.",
} as const;
const ALL_FLAG = {
  name: "all",
  type: "boolean",
  description: "Take every skill the repository holds.",
} as const;

async function installFromGit(context: CommandContext, url: string): Promise<Skill[]> {
  const { core, args } = context;
  const name = flagString(args, NAME_FLAG.name);
  const preview = await core.api.install.previewGit(url);
  try {
    const chosen = selectSkills(
      preview.skills,
      flagList(args, SKILL_FLAG.name),
      flagBoolean(args, ALL_FLAG.name),
    );
    if (name !== undefined && chosen.length !== 1) {
      throw new UsageError("--name only works when exactly one skill is installed.");
    }
    const items: InstallSelection[] = chosen.map((skill) => ({
      relPath: skill.relPath,
      name: name ?? skill.name,
    }));
    return await core.api.install.confirmGit(preview.previewId, items);
  } catch (error) {
    // The temporary clone is ours to clean up when nothing got installed from it.
    await core.api.install.cancelPreview(preview.previewId).catch(() => undefined);
    throw error;
  }
}

async function run(context: CommandContext): Promise<CommandResult> {
  const { core, args, cwd } = context;
  limitPositionals(args, 1);
  const source = classifySource(positional(args, 0, "what to install"));
  const name = flagString(args, NAME_FLAG.name);
  let installed: Skill[];
  if (source.kind === "path") {
    const path = resolveUserPath(source.path, cwd, core.ctx.homeDir);
    installed = [await core.api.install.fromPath(path, name)];
  } else if (source.kind === "market") {
    if (name !== undefined) throw new UsageError("--name is not supported for owner/repo@skill.");
    installed = [await core.api.install.fromMarket(source.source, source.skillId)];
  } else {
    installed = await installFromGit(context, source.url);
  }
  const lines = installed.map((skill) => `Installed ${skill.name} (${skill.id}) into the library.`);
  lines.push("Installing does not deploy. Next: skills deploy <ref> --agent <key>");
  return { value: { installed }, text: lines.join("\n") };
}

export const installCommand: CommandSpec = {
  name: "install",
  summary: "Add a skill to the library (does not deploy it)",
  usage: "<source> [--name <name>] [--skill <id>…] [--all]",
  flags: [NAME_FLAG, SKILL_FLAG, ALL_FLAG],
  notes: [
    "Sources: ./folder, ./archive.zip, ./archive.skill, a git URL, owner/repo, owner/repo@skill.",
    "A folder must start with ./, ../, / or ~/ - a bare owner/repo always means GitHub.",
  ],
  run,
};
