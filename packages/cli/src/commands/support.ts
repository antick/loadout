import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  type Core,
  type ResolvedAgent,
  expandHome,
  invalid,
  notFound,
  targetConflict,
} from "@loadout/core";
import type { ApplyResult, Preset, Skill } from "@loadout/shared";
import { type FlagSpec, type ParsedArgs, UsageError, flagBoolean, flagList } from "../args";
import { exitCodeFor } from "../exit-codes";
import { failureLines, plural } from "../output";
import type { CommandResult } from "./types";

/**
 * When a command asks for --yes, the same rule for all of them:
 * - Needs --yes: deleting or overwriting something Loadout cannot give back as it was. A
 *   permanent delete (`removed delete`, `presets delete`), a library skill
 *   removed with its deployments (`skills remove`, `skills merge`), every
 *   deployment of an agent (`agents disable`), the whole library rolled back (`git restore`), a
 *   push to another repository (`skills publish`), a file overwritten outside the library
 *   (`--out` of an export).
 * - No --yes: anything kept in Recently removed and restored as it was (`project unapply`,
 *   `project apply --prune`), undone by the opposite command (`skills undeploy`, `presets undeploy`,
 *   `skills block`), or a field set again in one step (tags, notes, favourites).
 * - A dry run never needs it, and --json never implies it.
 * A few commands also take --yes to answer their own yes/no question that a script must answer
 * on purpose (a download that moved to another site, a source that differs); they describe it.
 */
export const YES_FLAG: FlagSpec = {
  name: "yes",
  short: "y",
  type: "boolean",
  description: "Confirm an action that cannot be undone. Never implied, not even by --json.",
};

/** --yes with what it confirms on one command, so its help says what it really does. */
export const yesFlag = (description: string): FlagSpec => ({ ...YES_FLAG, description });

/** --undo on a command that marks something, with what taking it back means there. */
export const undoFlag = (description: string): FlagSpec => ({
  name: "undo",
  type: "boolean",
  description,
});

export const ACCEPT_RISK_FLAG: FlagSpec = {
  name: "accept-risk",
  type: "boolean",
  description: "Install skills the safety check flags. Read the findings first.",
};

export const ALLOW_SECRETS_FLAG: FlagSpec = {
  name: "allow-secrets",
  type: "boolean",
  description: "Back up what looks like keys or tokens anyway. Read the findings first.",
};

export const DRY_RUN_FLAG: FlagSpec = {
  name: "dry-run",
  type: "boolean",
  description: "Report what would happen and change nothing.",
};

/** --yes where the command always needs it, a dry run aside: usage shows `(--dry-run | --yes)`. */
export const REQUIRED_YES_FLAG: FlagSpec = { ...YES_FLAG, requiredUnless: DRY_RUN_FLAG.name };

/** --yes on a command that no longer needs it: accepted, so scripts that pass it keep working. */
export const LEGACY_YES_FLAG: FlagSpec = {
  ...YES_FLAG,
  description:
    "Not needed: what this removes waits in Recently removed or is put back in one step.",
  hidden: true,
};

/** --yes on a command that writes a file: needed to replace one that is already there. */
export const OVERWRITE_FLAG = yesFlag("Replace the file when it already exists.");

/** Writing over a file outside the library has no way back, so it needs --yes. */
export function refuseOverwrite(args: ParsedArgs, path: string): void {
  if (existsSync(path) && !flagBoolean(args, OVERWRITE_FLAG.name)) {
    throw new UsageError(`${path} already exists. Add --yes to replace it.`);
  }
}

export const SKIP_CONFLICTS_FLAG: FlagSpec = {
  name: "skip-conflicts",
  type: "boolean",
  description:
    "Leave out folders this tool did not create and deploy the rest, instead of failing.",
};

/** Help note of every command that deploys: what happens to a folder Loadout did not make. */
export const DEPLOY_NOTE =
  "A folder of the same name that this tool did not put there is never replaced: the command fails with TARGET_CONFLICT and lists the paths.";

export const AGENT_FLAG: FlagSpec = {
  name: "agent",
  short: "a",
  type: "list",
  value: "key",
  description: "Agent key from `agents list`. Repeat for several agents.",
};

export function positional(args: ParsedArgs, index: number, label: string): string {
  const value = args.positionals[index]?.trim();
  if (!value) throw new UsageError(`Missing ${label}.`);
  return value;
}

export function positionalsFrom(args: ParsedArgs, index: number, label: string): string[] {
  const values = args.positionals.slice(index).filter((value) => value.trim());
  if (values.length === 0) throw new UsageError(`Missing ${label}.`);
  return values;
}

export function limitPositionals(args: ParsedArgs, max: number): void {
  const extra = args.positionals[max];
  if (extra !== undefined) throw new UsageError(`Unexpected argument: ${extra}`);
}

/** Destructive commands stop here unless the caller said `--yes` (a dry run changes nothing). */
export function requireYes(args: ParsedArgs, action: string): void {
  if (flagBoolean(args, DRY_RUN_FLAG.name) || flagBoolean(args, YES_FLAG.name)) return;
  throw new UsageError(
    `This would ${action}. Run it with --dry-run to preview, or add --yes to go ahead.`,
  );
}

/** `~`, relative and absolute paths, as a shell user expects them. */
export function resolveUserPath(input: string, cwd: string, homeDir: string): string {
  return resolve(cwd, expandHome(input, homeDir));
}

export function resolveSkills(core: Core, refs: readonly string[]): Skill[] {
  const seen = new Set<string>();
  return refs
    .map((ref) => core.store.resolve(ref))
    .filter((skill) => !seen.has(skill.id) && seen.add(skill.id));
}

/**
 * Agents named on the command line must exist - a typo is never skipped silently. Deploying also
 * needs them usable; removing does not, so leftovers of a vanished agent can still be cleaned up.
 */
export function requireAgents(core: Core, args: ParsedArgs, usable: boolean): ResolvedAgent[] {
  const keys = [...new Set(flagList(args, AGENT_FLAG.name))];
  if (keys.length === 0) throw new UsageError("Name at least one agent with --agent <key>.");
  return keys.map((key) => requireAgent(core, key, usable));
}

export function requireAgent(core: Core, key: string, usable: boolean): ResolvedAgent {
  const agent = core.registry.get(key);
  if (!usable) return agent;
  if (!agent.installed) throw invalid(`${agent.displayName} is not installed on this machine.`);
  if (!agent.enabled) {
    throw invalid(`${agent.displayName} is disabled. Run \`agents enable ${key}\` first.`);
  }
  return agent;
}

export async function resolvePreset(core: Core, ref: string): Promise<Preset> {
  const presets = await core.api.presets.list();
  const byId = presets.find((preset) => preset.id === ref);
  if (byId) return byId;
  const matches = presets.filter((preset) => preset.name.toLowerCase() === ref.toLowerCase());
  if (matches.length > 1) throw notFound(`Several presets are called "${ref}" - use the id.`);
  const [match] = matches;
  if (!match) throw notFound(`Preset not found: ${ref}`);
  return match;
}

const blockedNote = (result: ApplyResult): string =>
  result.blocked > 0 ? `, ${result.blocked} blocked` : "";

/** A dry run's counts: what would change, and a reminder that nothing did. */
export function describeDryApply(result: ApplyResult): string {
  return `Would add ${plural(result.added, "deployment")} and remove ${result.removed}; ${result.skipped} already as wanted${blockedNote(result)}. Nothing was changed.`;
}

export function describeApply(result: ApplyResult): string {
  const lines = [
    `${plural(result.added, "deployment")} added, ${result.removed} removed, ${result.skipped} already as wanted${blockedNote(result)}.`,
  ];
  lines.push(...failureLines(result.failed));
  return lines.join("\n");
}

/**
 * The outcome of a deploy or undeploy, the same for `skills` and `presets`. A refusal to
 * overwrite someone else's folder is the answer, not a footnote in a summary, unless the caller
 * asked to go on without those folders. A dry run refuses exactly what the real run would.
 */
export function applyOutcome(
  result: ApplyResult,
  options: { dryRun: boolean; skipConflicts: boolean; subject?: string },
): CommandResult {
  if (result.conflicts.length > 0 && !options.skipConflicts) throw targetConflict(result.conflicts);
  const summary = options.dryRun ? describeDryApply(result) : describeApply(result);
  return {
    value: { dryRun: options.dryRun, ...result },
    text: [
      options.subject ? `${options.subject}: ${summary}` : summary,
      // Only reached with --skip-conflicts; without it these were thrown as an error.
      ...result.conflicts.map((conflict) => `Left alone: ${conflict.path} (${conflict.reason})`),
    ].join("\n"),
    exitCode: exitCodeFor(result.failed.length > 0),
  };
}
