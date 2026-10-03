import {
  SKILLS_FILE_NAME,
  SKILLS_LOCK_NAME,
  type SkillsFileAction,
  type SkillsFileInit,
  type SkillsFilePlan,
  type SkillsFileResult,
  formatRevision,
} from "@loadout/shared";
import { flagBoolean, flagList, flagString } from "../args";
import { plural, table } from "../output";
import {
  ACCEPT_RISK_FLAG,
  AGENT_FLAG,
  DRY_RUN_FLAG,
  YES_FLAG,
  limitPositionals,
  requireYes,
  resolveUserPath,
} from "./support";
import { suggestCommand } from "./project-suggest";
import type { CommandContext, CommandGroup, CommandResult, CommandSpec } from "./types";

const DIR_FLAG = {
  name: "dir",
  type: "string",
  value: "path",
  description: `Folder to look in (and above) for ${SKILLS_FILE_NAME}. Default: this folder.`,
} as const;
const FORCE_FLAG = {
  name: "force",
  type: "boolean",
  description: "Also replace or remove folders changed by hand (kept in Recently removed first).",
} as const;
const SOURCE_FLAG = {
  name: "source",
  type: "list",
  value: "url",
  description: "Source to list: a Git URL or owner/repo. Repeat for several.",
} as const;

const UPDATE_FLAG = {
  name: "update",
  type: "boolean",
  description: "Move every source to the newest commit of its branch or tag.",
} as const;
const PRUNE_FLAG = {
  name: "prune",
  type: "boolean",
  description: `Also remove folders ${SKILLS_FILE_NAME} no longer lists.`,
} as const;

/** Characters of a commit shown in text. */

const ACTION_WORDS: Record<SkillsFileAction, string> = {
  add: "add",
  update: "update",
  same: "up to date",
  edited: "changed by hand: kept",
  remove: "remove",
  keep_edited: "changed by hand: kept",
};

function directory(context: CommandContext): string {
  const dir = flagString(context.args, DIR_FLAG.name);
  return dir === undefined
    ? context.cwd
    : resolveUserPath(dir, context.cwd, context.core.ctx.homeDir);
}

function planText(plan: SkillsFilePlan, heading: string): string {
  const lines = [heading, `Project: ${plan.root}`];
  for (const source of plan.sources) {
    const at = formatRevision(source.revision);
    const ref = source.ref ? ` (${source.ref})` : "";
    lines.push(`Source ${source.url}${ref} at ${at}${source.moved ? ", newly pinned" : ""}`);
    if (source.missing.length > 0) {
      lines.push(`  Not in this source: ${source.missing.join(", ")}`);
    }
  }
  lines.push(
    table(
      ["folder", "skill", "what happens", "agents"],
      plan.entries.map((entry) => [
        entry.folder,
        entry.skill,
        ACTION_WORDS[entry.action],
        entry.agents.join(", "),
      ]),
      "Nothing to do.",
    ),
  );
  if (plan.entries.some((e) => e.action === "edited" || e.action === "keep_edited")) {
    lines.push(
      `Folders changed by hand are left alone. --${FORCE_FLAG.name} replaces or removes them (the old ones go to Recently removed).`,
    );
  }
  if (plan.unknownAgents.length > 0) {
    lines.push(`No agent here called ${plan.unknownAgents.join(", ")}; they get nothing.`);
  }
  return lines.join("\n");
}

function resultText(result: SkillsFileResult): string {
  const done = `Wrote ${plural(result.written, "folder")}, removed ${result.removed}.`;
  const kept = result.kept.length > 0 ? `\nKept, changed by hand: ${result.kept.join(", ")}` : "";
  return `${planText(result.plan, done)}${kept}\n${SKILLS_LOCK_NAME} records what was written; commit it with ${SKILLS_FILE_NAME}.`;
}

/** Apply, update or prune: the same run with different options. */
function applyCommand(
  name: string,
  summary: string,
  preset: { update?: boolean; prune?: boolean },
  notes: string[],
): CommandSpec {
  const extraFlags = preset.update || preset.prune ? [] : [UPDATE_FLAG, PRUNE_FLAG];
  return {
    name,
    summary,
    usage: "[--dir <path>] [--force] [--accept-risk] [--dry-run]",
    flags: [DIR_FLAG, ...extraFlags, FORCE_FLAG, ACCEPT_RISK_FLAG, DRY_RUN_FLAG],
    notes,
    run: async (context) => {
      const { core, args } = context;
      limitPositionals(args, 0);
      const options = {
        update: preset.update === true || flagBoolean(args, UPDATE_FLAG.name),
        prune: preset.prune === true || flagBoolean(args, PRUNE_FLAG.name),
        force: flagBoolean(args, FORCE_FLAG.name),
        acceptRisk: flagBoolean(args, ACCEPT_RISK_FLAG.name),
      };
      const dir = directory(context);
      if (flagBoolean(args, DRY_RUN_FLAG.name)) {
        const plan = await core.api.skillsFile.plan(dir, options);
        return {
          value: { dryRun: true, plan },
          text: planText(plan, "Dry run: nothing was written."),
        };
      }
      const result = await core.api.skillsFile.apply(dir, options);
      // Keeping a folder changed by hand is a safety stop, not a failure.
      return { value: result, text: resultText(result) };
    },
  };
}

async function init(context: CommandContext): Promise<CommandResult> {
  const { core, args } = context;
  limitPositionals(args, 0);
  const dir = directory(context);
  const agents = flagList(args, AGENT_FLAG.name);
  const sources = flagList(args, SOURCE_FLAG.name);
  const suggested: SkillsFileInit =
    agents.length > 0 || sources.length > 0
      ? { agents: [], sources: [] }
      : await core.api.skillsFile.suggest(dir);
  const chosen: SkillsFileInit = {
    agents:
      agents.length > 0 ? agents : suggested.agents.length > 0 ? suggested.agents : ["claude_code"],
    sources:
      sources.length > 0
        ? sources.map((url) => ({ url, ref: null, skills: null }))
        : suggested.sources,
  };
  const info = await core.api.skillsFile.create(dir, chosen);
  const lines = [`Wrote ${info.path}.`];
  if (chosen.sources.length === 0) {
    lines.push("It lists no sources yet: add [[sources]] entries, then run `project apply`.");
  } else {
    lines.push(`Lists ${plural(chosen.sources.length, "source")}. Next: project apply`);
  }
  return { value: info, text: lines.join("\n") };
}

async function unapply(context: CommandContext): Promise<CommandResult> {
  const { core, args } = context;
  limitPositionals(args, 0);
  requireYes(args, `remove the skill folders ${SKILLS_FILE_NAME} wrote`);
  const dryRun = flagBoolean(args, DRY_RUN_FLAG.name);
  const result = await core.api.skillsFile.unapply(directory(context), {
    force: flagBoolean(args, FORCE_FLAG.name),
    dryRun,
  });
  const text = dryRun ? planText(result.plan, "Dry run: nothing was removed.") : resultText(result);
  return { value: result, text };
}

export const projectGroup: CommandGroup = {
  name: "project",
  summary: `A project's ${SKILLS_FILE_NAME}: the skills it uses, for everyone who checks it out`,
  commands: [
    {
      name: "init",
      summary: `Write ${SKILLS_FILE_NAME}, listing the project's skills that came from a repository`,
      usage: "[--dir <path>] [--agent <key>…] [--source <url>…]",
      flags: [DIR_FLAG, AGENT_FLAG, SOURCE_FLAG],
      notes: [
        "Without --agent or --source it lists what the project's agent folders already hold that",
        "the library knows from a repository. Skills made by hand are not listed.",
      ],
      run: init,
    },
    applyCommand("apply", "Put the listed skills into the project's agent folders", {}, [
      `Uses the commits pinned in ${SKILLS_LOCK_NAME}, so everyone gets identical files.`,
      "Folders changed by hand are never replaced without --force. The library is not touched.",
      "Skills are safety-checked before they are written; a flagged one stops the run with",
      "UNSAFE and its findings. --accept-risk writes it anyway.",
    ]),
    applyCommand("update", "Move every source to its newest commit, then apply", { update: true }, [
      `Rewrites the pins in ${SKILLS_LOCK_NAME}.`,
    ]),
    applyCommand(
      "prune",
      `Apply, and remove folders ${SKILLS_FILE_NAME} no longer lists`,
      { prune: true },
      ["Only folders Loadout wrote and nobody changed are removed; they go to Recently removed."],
    ),
    {
      name: "unapply",
      summary: "Remove every skill folder apply wrote",
      usage: "--yes [--dir <path>] [--force] [--dry-run]",
      flags: [DIR_FLAG, YES_FLAG, FORCE_FLAG, DRY_RUN_FLAG],
      notes: ["Removed folders wait in Recently removed. The file and its lock stay."],
      run: unapply,
    },
    suggestCommand,
  ],
};
