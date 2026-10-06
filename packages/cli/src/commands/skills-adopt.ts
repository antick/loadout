import { statSync } from "node:fs";
import {
  type Core,
  type ResolvedAgent,
  adoptAgentSkills,
  canonicalPath,
  invalid,
  notFound,
} from "@loadout/core";
import { flagBoolean } from "../args";
import { failureLines, plural } from "../output";
import { DRY_RUN_FLAG, limitPositionals, positional, resolveUserPath } from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";
import { exitCodeFor } from "../exit-codes";
import { isAgentAvailable } from "@loadout/shared";

/** The agent whose own skills folder this is. Usable agents win when several share the folder. */
function owningAgent(core: Core, dir: string): ResolvedAgent {
  const owners = core.registry.list().filter((agent) => canonicalPath(agent.skillsDir) === dir);
  const owner = owners.find(isAgentAvailable) ?? owners[0];
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
  const dir = canonicalPath(input);
  const agent = owningAgent(core, dir);

  // The agent's own skills folder is `dir`, the one the workspace lists for it.
  const dryRun = flagBoolean(args, DRY_RUN_FLAG.name);
  const { adopted, skipped, failed } = await adoptAgentSkills(core.api.workspace, agent.key, {
    dryRun,
  });
  const skipLines = skipped.map((skill) => `  skip:  ${skill.name} (${skill.reason})`);
  if (dryRun) {
    const lines = [
      `Would adopt ${plural(adopted.length, "skill")} for ${agent.displayName}; ${skipped.length} skipped. Nothing was changed.`,
      ...adopted.map((skill) => `  adopt: ${skill.name}`),
      ...skipLines,
    ];
    return { value: { dryRun, agent: agent.key, adopted, skipped }, text: lines.join("\n") };
  }
  const lines = [
    `Adopted ${plural(adopted.length, "skill")} for ${agent.displayName}; ${skipped.length} skipped.`,
    ...skipLines,
    ...failureLines(failed),
  ];
  return {
    value: { dryRun, agent: agent.key, adopted, skipped, failed },
    text: lines.join("\n"),
    exitCode: exitCodeFor(failed.length > 0),
  };
}

export const adoptCommand: CommandSpec = {
  name: "adopt",
  summary: "Import every skill in an agent's folder and manage it from the library",
  usage: "<dir>",
  flags: [DRY_RUN_FLAG],
  notes: [
    "<dir> must be an agent's skills folder, e.g. ~/.claude/skills.",
    "Each skill is copied into the library first, then its folder becomes a managed deployment.",
  ],
  run,
};
