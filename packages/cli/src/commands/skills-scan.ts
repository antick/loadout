import type { SafetyRecord } from "@loadout/shared";
import { UsageError, flagBoolean } from "../args";
import { plural } from "../output";
import { resolveSkills } from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

const ALL_FLAG = {
  name: "all",
  type: "boolean",
  description: "Every library skill that is new or changed since its last check.",
} as const;
const FORCE_FLAG = {
  name: "force",
  type: "boolean",
  description: "With --all: check every skill again.",
} as const;

function line(name: string, record: SafetyRecord): string {
  const worst = record.findings[0];
  const detail = worst ? `, ${worst.severity} ${worst.category} in ${worst.file}` : "";
  const engine = record.engine === "builtin" ? "rules" : "SkillSpector";
  return `${name}: ${record.verdict} (risk ${record.score}/100${detail}; ${engine})`;
}

/** Run the safety check on library skills: Loadout's rules, or SkillSpector when installed. */
async function scan(context: CommandContext): Promise<CommandResult> {
  const { core, args } = context;
  const all = flagBoolean(args, ALL_FLAG.name);
  if ((args.positionals.length === 0) === !all) {
    throw new UsageError("Give one or more skills, or --all.");
  }
  if (all) {
    const value = await core.api.safety.scanLibrary(flagBoolean(args, FORCE_FLAG.name));
    const lines = [
      `Checked ${plural(value.scanned, "skill")}: ${value.unsafe} flagged, ${value.caution} to review.`,
      ...value.failed.map((failure) => `${failure.name}: ${failure.message}`),
    ];
    return { value, text: lines.join("\n") };
  }
  const skills = resolveSkills(core, args.positionals);
  const records: SafetyRecord[] = [];
  for (const skill of skills) records.push(await core.api.safety.scanSkill(skill.id));
  return {
    value: records,
    text: records
      .map((record, index) => line(skills[index]?.name ?? record.skillId, record))
      .join("\n"),
  };
}

export const scanCommand: CommandSpec = {
  name: "scan",
  summary: "Safety-check skills: built-in rules, or SkillSpector when installed",
  usage: "<ref>… | --all [--force]",
  flags: [ALL_FLAG, FORCE_FLAG],
  notes: [
    "Loadout's own rules always run: destructive commands, code that phones home, prompt injection, credential theft. Static, no AI model.",
    "With NVIDIA SkillSpector installed (uv tool install git+https://github.com/NVIDIA/skillspector.git) its deeper checks run instead.",
    "Verdicts: safe, caution, unsafe.",
  ],
  run: scan,
};
