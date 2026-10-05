import type { Core } from "@loadout/core";
import {
  type DuplicateMergeResult,
  type DuplicatePair,
  type DuplicateReason,
  REMOVED_KEEP_DAYS,
  formatSimilarity,
} from "@loadout/shared";
import { type FlagSpec, UsageError, flagBoolean, flagString } from "../args";
import { plural, table } from "../output";
import {
  DRY_RUN_FLAG,
  REQUIRED_YES_FLAG,
  limitPositionals,
  positional,
  requireYes,
} from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

const ALL_FLAG = {
  name: "all",
  type: "boolean",
  description: "Also list the pairs marked as not duplicates.",
} as const;
const KEEP_FLAG = {
  name: "keep",
  type: "string",
  value: "ref",
  description: "The skill to keep (id, name or folder name).",
} as const;
const REMOVE_FLAG = {
  name: "remove",
  type: "string",
  value: "ref",
  description: "The skill to remove once its tags, presets and agents are on the kept one.",
} as const;

const REASON_TEXT: Record<DuplicateReason, string> = {
  identical: "same files",
  content: "same text",
  name: "alike name",
};

const nameOf = (core: Core, id: string): string => core.store.find(id)?.name ?? id;

function pairRow(core: Core, pair: DuplicatePair): (string | boolean)[] {
  return [
    nameOf(core, pair.a),
    nameOf(core, pair.b),
    REASON_TEXT[pair.reason],
    formatSimilarity(Math.max(pair.contentScore, pair.nameScore)),
    pair.dismissed,
  ];
}

async function list({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 0);
  // Asked for on purpose, so the texts are compared too.
  const report = await core.api.duplicates.find({
    includeDismissed: flagBoolean(args, "all"),
    similarText: true,
  });
  const rows = report.pairs.map((pair) => pairRow(core, pair));
  const lines = [
    table(["skill", "and", "why", "alike", "dismissed"], rows, "No skills look like duplicates."),
  ];
  if (report.dismissedCount > 0 && !flagBoolean(args, "all")) {
    lines.push(
      `${plural(report.dismissedCount, "pair")} marked as not duplicates (--all lists them).`,
    );
  }
  if (rows.length > 0) {
    lines.push(
      "Keep one with: skills duplicates merge --keep <ref> --remove <ref> --yes",
      "Or say they differ: skills duplicates dismiss <ref> <ref>",
    );
  }
  return { value: report, text: lines.join("\n") };
}

async function dismiss(context: CommandContext, dismissed: boolean): Promise<CommandResult> {
  const { core, args } = context;
  limitPositionals(args, 3);
  const a = core.store.resolve(positional(args, 1, "two skills (id, name or folder name)"));
  const b = core.store.resolve(positional(args, 2, "a second skill"));
  if (dismissed) await core.api.duplicates.dismiss(a.id, b.id);
  else await core.api.duplicates.undismiss(a.id, b.id);
  return {
    value: { a: a.id, b: b.id, dismissed },
    text: dismissed
      ? `${a.name} and ${b.name} will not be listed as duplicates.`
      : `${a.name} and ${b.name} may be listed as duplicates again.`,
  };
}

function describeMerge(core: Core, result: DuplicateMergeResult, dryRun: boolean): string {
  const kept = nameOf(core, result.keptId);
  const lines = [
    `${dryRun ? "Would keep" : "Kept"} ${kept}${dryRun ? "" : " and removed the other"}.`,
  ];
  if (result.tagsAdded > 0) lines.push(`  ${plural(result.tagsAdded, "tag")} added to ${kept}`);
  if (result.presetsJoined > 0) {
    lines.push(`  ${kept} joined ${plural(result.presetsJoined, "preset")}`);
  }
  if (result.deployedTo.length > 0) {
    lines.push(`  ${kept} deployed to: ${result.deployedTo.join(", ")}`);
  }
  if (result.blockedFor.length > 0) {
    lines.push(`  Not deployed (${kept} is blocked there): ${result.blockedFor.join(", ")}`);
  }
  lines.push(
    dryRun
      ? "Nothing was changed."
      : `The removed skill is in Recently removed for ${REMOVED_KEEP_DAYS} days.`,
  );
  return lines.join("\n");
}

async function merge(context: CommandContext): Promise<CommandResult> {
  const { core, args } = context;
  limitPositionals(args, 1);
  const keepRef = flagString(args, KEEP_FLAG.name);
  const removeRef = flagString(args, REMOVE_FLAG.name);
  if (!keepRef || !removeRef)
    throw new UsageError("Name both skills: --keep <ref> --remove <ref>.");
  const keep = core.store.resolve(keepRef);
  const remove = core.store.resolve(removeRef);
  requireYes(args, `remove ${remove.name} from the library`);
  const dryRun = flagBoolean(args, DRY_RUN_FLAG.name);
  const result = await core.api.duplicates.merge(keep.id, remove.id, { dryRun });
  return { value: { dryRun, ...result }, text: describeMerge(core, result, dryRun) };
}

const ACTIONS: Record<string, (context: CommandContext) => Promise<CommandResult>> = {
  merge,
  dismiss: (context) => dismiss(context, true),
  restore: (context) => dismiss(context, false),
};
const DUPLICATES_FLAGS: readonly FlagSpec[] = [
  ALL_FLAG,
  KEEP_FLAG,
  REMOVE_FLAG,
  DRY_RUN_FLAG,
  REQUIRED_YES_FLAG,
];
/** The flags each action uses: any other one given is refused, never quietly ignored. */
const ACTION_FLAGS: Record<string, readonly FlagSpec[]> = {
  list: [ALL_FLAG],
  merge: [KEEP_FLAG, REMOVE_FLAG, DRY_RUN_FLAG, REQUIRED_YES_FLAG],
  dismiss: [],
  restore: [],
};

/** `skills duplicates [merge|dismiss|restore]`: list pairs that may be one skill, and act on them. */
async function duplicates(context: CommandContext): Promise<CommandResult> {
  const action = context.args.positionals[0];
  const run = action === undefined ? list : ACTIONS[action];
  if (!run) throw new UsageError(`Unknown action "${action}". Use merge, dismiss or restore.`);
  const allowed = ACTION_FLAGS[action ?? "list"] ?? [];
  const stray = DUPLICATES_FLAGS.find(
    (flag) => context.args.flags[flag.name] !== undefined && !allowed.includes(flag),
  );
  if (stray) {
    throw new UsageError(`--${stray.name} does not go with ${action ?? "the list of pairs"}.`);
  }
  return run(context);
}

export const duplicatesCommand: CommandSpec = {
  name: "duplicates",
  summary: "Find skills that look like one skill installed twice",
  usage:
    "[--all | merge --keep <ref> --remove <ref> (--dry-run | --yes) | dismiss <ref> <ref> | restore <ref> <ref>]",
  flags: DUPLICATES_FLAGS,
  notes: [
    "Lists pairs whose files are the same, whose SKILL.md is mostly the same text, or whose names and descriptions are alike. Nothing is removed by itself.",
    "merge moves the removed skill's tags, presets and agents to the kept one first, and removes nothing if that fails. The removed skill goes to Recently removed.",
    "dismiss hides a pair that is not a duplicate; restore lists it again. Dismissals stay on this computer.",
  ],
  run: duplicates,
};
