import {
  USAGE_RECENT_DAYS,
  type UsageReport,
  formatRelative,
  isUnusedSkill,
  usageById,
} from "@loadout/shared";
import { UsageError, flagBoolean } from "../args";
import { table } from "../output";
import { limitPositionals } from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

const REFRESH_FLAG = {
  name: "refresh",
  type: "boolean",
  description: "Read what the agents' logs gained since the last look first.",
} as const;
const UNUSED_FLAG = {
  name: "unused",
  type: "boolean",
  description: `Only skills no agent ran in the last ${USAGE_RECENT_DAYS} days.`,
} as const;
const ENABLE_FLAG = {
  name: "enable",
  type: "boolean",
  description: "Turn usage tracking on and read the logs.",
} as const;
const DISABLE_FLAG = {
  name: "disable",
  type: "boolean",
  description: "Turn usage tracking off and forget what was read.",
} as const;

const OFF_TEXT = [
  "Usage tracking is off.",
  "Turn it on to count how often agents run each skill, read from their own session logs on this computer: skills usage --enable",
].join("\n");

async function reportFor({ core, args }: CommandContext): Promise<UsageReport> {
  const enable = flagBoolean(args, ENABLE_FLAG.name);
  const disable = flagBoolean(args, DISABLE_FLAG.name);
  if (enable && disable) throw new UsageError("Use --enable or --disable, not both.");
  if (enable || disable) return core.api.usage.setEnabled(enable);
  return flagBoolean(args, REFRESH_FLAG.name) ? core.api.usage.scan() : core.api.usage.report();
}

/** How often each library skill ran, most used first; or the ones that did not run lately. */
async function usage(context: CommandContext): Promise<CommandResult> {
  limitPositionals(context.args, 0);
  const report = await reportFor(context);
  if (!report.enabled) return { value: report, text: OFF_TEXT };

  const skills = await context.core.api.skills.list();
  const byId = usageById(report);
  const unusedOnly = flagBoolean(context.args, UNUSED_FLAG.name);
  const shown = skills
    .filter((skill) => !unusedOnly || isUnusedSkill(skill, byId))
    .map((skill) => ({ skill, used: byId.get(skill.id) }))
    .sort(
      (a, b) =>
        (b.used?.uses ?? 0) - (a.used?.uses ?? 0) ||
        a.skill.name.localeCompare(b.skill.name, undefined, { sensitivity: "base" }),
    );
  const rows = shown.map(({ skill, used }) => [
    skill.name,
    used?.uses ?? 0,
    used?.recentUses ?? 0,
    used ? formatRelative(used.lastUsedAt) : "never",
    used ? Object.keys(used.byAgent).join(", ") : "",
  ]);
  const missing = report.logs.filter((log) => !log.found).map((log) => log.agentKey);
  const lines = [
    table(
      ["skill", "runs", `last ${USAGE_RECENT_DAYS} days`, "last run", "agents"],
      rows,
      unusedOnly ? "Every skill ran lately." : "The library has no skills.",
    ),
    "",
    `Logs last read ${report.scannedAt ? formatRelative(report.scannedAt) : "never"}.${
      missing.length > 0 ? ` No logs found for: ${missing.join(", ")}.` : ""
    }`,
  ];
  const justRead = [REFRESH_FLAG, ENABLE_FLAG].some((flag) => flagBoolean(context.args, flag.name));
  if (!justRead) lines.push("Run with --refresh to read new runs.");
  return {
    value: unusedOnly
      ? {
          ...report,
          unused: shown.map(({ skill, used }) => ({
            skillId: skill.id,
            name: skill.name,
            lastUsedAt: used?.lastUsedAt ?? null,
          })),
        }
      : report,
    text: lines.join("\n"),
  };
}

export const usageCommand: CommandSpec = {
  name: "usage",
  summary: "How often agents ran each skill, from their session logs",
  usage: "[--enable | --disable]",
  flags: [REFRESH_FLAG, UNUSED_FLAG, ENABLE_FLAG, DISABLE_FLAG],
  notes: [
    "Reads Claude Code's and Codex's session logs on this computer; only skill names, times and project folders are kept, and nothing is sent anywhere.",
    "A skill counts as run when Claude Code calls it or you type /name, and when Codex opens its SKILL.md.",
  ],
  run: usage,
};
