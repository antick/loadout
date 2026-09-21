import { realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { type Core, type ResolvedAgent, errorMessage, invalid, notFound } from "@loadout/core";
import type { LocalSkill } from "@loadout/shared";
import { flagBoolean } from "../args";
import { plural } from "../output";
import { DRY_RUN_FLAG, limitPositionals, positional, resolveUserPath } from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

const REASON_MANAGED = "already managed";
const REASON_LIBRARY_DIFFERS =
  "the library holds a different version that adopting would overwrite - settle it in the app first";

function canonical(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/** The agent whose own skills folder this is. Usable agents win when several share the folder. */
function owningAgent(core: Core, dir: string): ResolvedAgent {
  const owners = core.registry.list().filter((agent) => canonical(agent.skillsDir) === dir);
  const owner = owners.find((agent) => agent.installed && agent.enabled) ?? owners[0];
  if (!owner) {
    throw invalid(
      `${dir} is not the skills folder of any known agent (see \`agents list\`). To copy skills into the library without deploying them, use \`skills install\`.`,
    );
  }
  if (!owner.enabled) {
    throw invalid(`${owner.displayName} is disabled. Run \`agents enable ${owner.key}\` first.`);
  }
  return owner;
}

/** Adopting overwrites the library match, so a library that has moved on is never a candidate. */
function skipReason(skill: LocalSkill): string | null {
  if (skill.managed) return REASON_MANAGED;
  if (skill.syncStatus === "library_newer" || skill.syncStatus === "diverged") {
    return REASON_LIBRARY_DIFFERS;
  }
  return null;
}

const view = (skill: LocalSkill) => ({
  name: skill.name,
  relativePath: skill.relativePath,
  syncStatus: skill.syncStatus,
});

async function run(context: CommandContext): Promise<CommandResult> {
  const { core, args, cwd } = context;
  limitPositionals(args, 1);
  const input = resolveUserPath(positional(args, 0, "the folder to adopt"), cwd, core.ctx.homeDir);
  const isDir = (() => {
    try {
      return statSync(input).isDirectory();
    } catch {
      return false;
    }
  })();
  if (!isDir) throw notFound(`Folder not found: ${input}`);
  const dir = canonical(input);
  const agent = owningAgent(core, dir);

  // The listing is already limited to that agent's own skills folder, which is `dir`.
  const found = await core.api.workspace.list(agent.key);
  const candidates = found.filter((skill) => skipReason(skill) === null);
  const skipped = found.flatMap((skill) => {
    const reason = skipReason(skill);
    return reason === null ? [] : [{ name: skill.name, relativePath: skill.relativePath, reason }];
  });

  if (flagBoolean(args, DRY_RUN_FLAG.name)) {
    const lines = [
      `Would adopt ${plural(candidates.length, "skill")} for ${agent.displayName}; ${skipped.length} skipped. Nothing was changed.`,
      ...candidates.map((skill) => `  adopt: ${skill.name}`),
      ...skipped.map((skill) => `  skip:  ${skill.name} (${skill.reason})`),
    ];
    return {
      value: { dryRun: true, agent: agent.key, candidates: candidates.map(view), skipped },
      text: lines.join("\n"),
    };
  }

  const adopted: { name: string; skillId: string }[] = [];
  const failed: { name: string; message: string }[] = [];
  for (const skill of candidates) {
    try {
      const librarySkill = await core.api.workspace.upload(agent.key, skill.relativePath);
      adopted.push({ name: skill.name, skillId: librarySkill.id });
    } catch (error) {
      failed.push({ name: skill.name, message: errorMessage(error) });
    }
  }
  const lines = [
    `Adopted ${plural(adopted.length, "skill")} for ${agent.displayName}; ${skipped.length} skipped.`,
    ...skipped.map((skill) => `  skip:  ${skill.name} (${skill.reason})`),
    ...failed.map((failure) => `Failed: ${failure.name} - ${failure.message}`),
  ];
  return {
    value: { dryRun: false, agent: agent.key, adopted, skipped, failed },
    text: lines.join("\n"),
    exitCode: failed.length > 0 ? 1 : 0,
  };
}

export const adoptCommand: CommandSpec = {
  name: "adopt",
  summary: "Import every skill in an agent's folder and manage it from the library",
  usage: "<dir> [--dry-run]",
  flags: [DRY_RUN_FLAG],
  notes: [
    "<dir> must be an agent's skills folder, e.g. ~/.claude/skills.",
    "Each skill is copied into the library first, then its folder becomes a managed deployment.",
  ],
  run,
};
