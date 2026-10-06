import type { Core } from "@loadout/core";
import type { SafetyRecord, SafetyScanSummary } from "@loadout/shared";
import { UsageError, flagBoolean } from "../args";
import { plural } from "../output";
import { exitCodeFor } from "../exit-codes";
import { eachItem, resolveSkills, allSkillsFlag, refsOrAll } from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

const ALL_FLAG = allSkillsFlag("Every library skill that is new or changed since its last check.");
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

/** One shape for skills named and for `--all`: the counts, what failed, and each new report. */
interface ScanResult extends SafetyScanSummary {
  records: SafetyRecord[];
}

async function scanNamed(core: Core, refs: readonly string[]): Promise<ScanResult> {
  // Like `--all`: one skill the scanner chokes on does not stop the others.
  const { done: records, failed } = await eachItem(
    resolveSkills(core, refs),
    (skill) => skill.name,
    (skill) => core.api.safety.scanSkill(skill.id),
  );
  const count = (verdict: SafetyRecord["verdict"]): number =>
    records.filter((record) => record.verdict === verdict).length;
  return {
    scanned: records.length,
    unsafe: count("unsafe"),
    caution: count("caution"),
    failed,
    records,
  };
}

async function scanAll(core: Core, force: boolean): Promise<ScanResult> {
  const startedAt = Date.now();
  const summary = await core.api.safety.scanLibrary(force);
  const records = (await core.api.safety.list()).filter((record) => record.scannedAt >= startedAt);
  return { ...summary, records };
}

/**
 * Run the safety check on library skills: Loadout's rules, or SkillSpector when installed. Exit code
 * 1 when one comes back unsafe or could not be checked, like `validate` and `doctor` on errors.
 */
async function scan(context: CommandContext): Promise<CommandResult> {
  const { core, args } = context;
  const all = refsOrAll(args) === null;
  if (!all && flagBoolean(args, FORCE_FLAG.name)) {
    throw new UsageError("--force only works with --all; named skills are always checked again.");
  }
  const value = all
    ? await scanAll(core, flagBoolean(args, FORCE_FLAG.name))
    : await scanNamed(core, args.positionals);
  // Every report for skills named; with --all only the ones that need a look.
  const shown = all ? value.records.filter((record) => record.verdict !== "safe") : value.records;
  const lines = [
    ...shown.map((record) => line(core.store.find(record.skillId)?.name ?? record.skillId, record)),
    ...value.failed.map((failure) => `${failure.name}: ${failure.message}`),
    `Checked ${plural(value.scanned, "skill")}: ${value.unsafe} flagged, ${value.caution} to review.`,
  ];
  return {
    value,
    text: lines.join("\n"),
    exitCode: exitCodeFor(value.unsafe > 0 || value.failed.length > 0),
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
    "Exit code 1 when a skill checked in this run is unsafe or could not be checked. Caution does not fail it.",
  ],
  run: scan,
};
