import { isAbsolute, join, resolve } from "node:path";
import { type Core, type ResolvedAgent, invalid, notFound } from "@loadout/core";
import type { ApplyResult, Preset, Skill } from "@loadout/shared";
import { type FlagSpec, type ParsedArgs, UsageError, flagBoolean, flagList } from "../args";
import { plural } from "../output";

export const YES_FLAG: FlagSpec = {
  name: "yes",
  short: "y",
  type: "boolean",
  description: "Confirm a destructive action. Never implied, not even by --json.",
};

export const ACCEPT_RISK_FLAG: FlagSpec = {
  name: "accept-risk",
  type: "boolean",
  description: "Install skills the safety check flags. Read the findings first.",
};

export const DRY_RUN_FLAG: FlagSpec = {
  name: "dry-run",
  type: "boolean",
  description: "Report what would happen and change nothing.",
};

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
  const text = input.trim();
  if (text === "~") return homeDir;
  if (text.startsWith("~/") || text.startsWith("~\\")) return join(homeDir, text.slice(2));
  return isAbsolute(text) ? resolve(text) : resolve(cwd, text);
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

export const emptyApply = (): ApplyResult => ({
  added: 0,
  removed: 0,
  skipped: 0,
  conflicts: [],
  failed: [],
});

export function mergeApply(total: ApplyResult, part: ApplyResult): ApplyResult {
  return {
    added: total.added + part.added,
    removed: total.removed + part.removed,
    skipped: total.skipped + part.skipped,
    conflicts: [...total.conflicts, ...part.conflicts],
    failed: [...total.failed, ...part.failed],
  };
}

/** A dry run's counts: what would change, and a reminder that nothing did. */
export function describeDryApply(result: ApplyResult): string {
  return `Would add ${plural(result.added, "deployment")} and remove ${result.removed}; ${result.skipped} already as wanted. Nothing was changed.`;
}

export function describeApply(result: ApplyResult): string {
  const lines = [
    `${plural(result.added, "deployment")} added, ${result.removed} removed, ${result.skipped} already as wanted.`,
  ];
  for (const failure of result.failed) lines.push(`Failed: ${failure.name} - ${failure.message}`);
  return lines.join("\n");
}
