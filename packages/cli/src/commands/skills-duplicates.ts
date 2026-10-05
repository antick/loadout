import type { Core } from "@loadout/core";
import {
  type DuplicateMergeResult,
  type DuplicatePair,
  type DuplicateReason,
  REMOVED_KEEP_DAYS,
  formatSimilarity,
} from "@loadout/shared";
import { type FlagSpec, type ParsedArgs, UsageError, flagBoolean, flagString } from "../args";
import { plural, table } from "../output";
import {
  DRY_RUN_FLAG,
  REQUIRED_YES_FLAG,
  limitPositionals,
  positional,
  requireYes,
  undoFlag,
} from "./support";
import type { CommandContext, CommandResult, CommandSpec, LibraryCommandSpec } from "./types";

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
const UNDO_FLAG = undoFlag("List the pair as possible duplicates again.");

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
  const all = flagBoolean(args, ALL_FLAG.name);
  // Asked for on purpose, so the texts are compared too.
  const report = await core.api.duplicates.find({ includeDismissed: all, similarText: true });
  const rows = report.pairs.map((pair) => pairRow(core, pair));
  const lines = [
    table(["skill", "and", "why", "alike", "dismissed"], rows, "No skills look like duplicates."),
  ];
  if (report.dismissedCount > 0 && !all) {
    lines.push(
      `${plural(report.dismissedCount, "pair")} marked as not duplicates (--all lists them).`,
    );
  }
  if (rows.length > 0) {
    lines.push(
      "Keep one with: skills merge --keep <ref> --remove <ref> --yes",
      "Or say they differ: skills dismiss <ref> <ref>",
    );
  }
  return { value: report, text: lines.join("\n") };
}

async function dismiss({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 2);
  const undo = flagBoolean(args, UNDO_FLAG.name);
  const a = core.store.resolve(positional(args, 0, "two skills (id, name or folder name)"));
  const b = core.store.resolve(positional(args, 1, "a second skill"));
  if (undo) await core.api.duplicates.undismiss(a.id, b.id);
  else await core.api.duplicates.dismiss(a.id, b.id);
  return {
    value: { a: a.id, b: b.id, dismissed: !undo },
    text: undo
      ? `${a.name} and ${b.name} may be listed as duplicates again.`
      : `${a.name} and ${b.name} will not be listed as duplicates.`,
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

async function merge({ core, args }: CommandContext): Promise<CommandResult> {
  limitPositionals(args, 0);
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

export const mergeCommand: LibraryCommandSpec = {
  name: "merge",
  summary: "Keep one of two duplicate skills and remove the other",
  usage: "--keep <ref> --remove <ref>",
  flags: [KEEP_FLAG, REMOVE_FLAG, DRY_RUN_FLAG, REQUIRED_YES_FLAG],
  notes: [
    "The removed skill's tags, presets and agents move to the kept one first; nothing is removed if that fails. The removed skill goes to Recently removed.",
  ],
  run: merge,
};

export const dismissCommand: LibraryCommandSpec = {
  name: "dismiss",
  summary: "Mark two skills as not duplicates, or take that back",
  usage: "<ref> <ref>",
  flags: [UNDO_FLAG],
  notes: ["A dismissed pair is left out of skills duplicates. Dismissals stay on this computer."],
  run: dismiss,
};

/**
 * `skills duplicates merge|dismiss|restore …`, as older scripts and skills call the commands
 * that are now `skills merge` and `skills dismiss [--undo]`: forwarded there, with the same
 * checks on what was given.
 */
const FORWARDED: Record<string, { command: LibraryCommandSpec; flags: Record<string, true> }> = {
  merge: { command: mergeCommand, flags: {} },
  dismiss: { command: dismissCommand, flags: {} },
  restore: { command: dismissCommand, flags: { [UNDO_FLAG.name]: true } },
};
/** Accepted on `skills duplicates` only for the forwarded forms; left out of help and completion. */
const hiddenCopy = (flag: FlagSpec): FlagSpec => ({ ...flag, hidden: true });
const COMPAT_FLAGS: readonly FlagSpec[] = [
  hiddenCopy(KEEP_FLAG),
  hiddenCopy(REMOVE_FLAG),
  hiddenCopy(DRY_RUN_FLAG),
  hiddenCopy(REQUIRED_YES_FLAG),
];

/** A flag given that `allowed` does not hold is refused, never quietly ignored. */
function refuseStrayFlags(args: ParsedArgs, allowed: readonly FlagSpec[], what: string): void {
  const stray = [ALL_FLAG, ...COMPAT_FLAGS].find(
    (flag) => args.flags[flag.name] !== undefined && !allowed.some((a) => a.name === flag.name),
  );
  if (stray) throw new UsageError(`--${stray.name} does not go with ${what}.`);
}

/** `skills duplicates [--all]`: the pairs that may be one skill; older action words forwarded. */
async function duplicates(context: CommandContext): Promise<CommandResult> {
  const { args } = context;
  const action = args.positionals[0];
  if (action === undefined) {
    refuseStrayFlags(args, [ALL_FLAG], "the list of pairs");
    return list(context);
  }
  const target = FORWARDED[action];
  if (!target) throw new UsageError(`Unknown action "${action}". Use merge, dismiss or restore.`);
  refuseStrayFlags(args, target.command.flags, action);
  return target.command.run({
    ...context,
    args: { positionals: args.positionals.slice(1), flags: { ...args.flags, ...target.flags } },
  });
}

export const duplicatesCommand: CommandSpec = {
  name: "duplicates",
  summary: "Find skills that look like one skill installed twice",
  usage: "[--all]",
  flags: [ALL_FLAG, ...COMPAT_FLAGS],
  notes: [
    "Lists pairs whose files are the same, whose SKILL.md is mostly the same text, or whose names and descriptions are alike. Nothing is removed by itself.",
    "Keep one with skills merge; say they differ with skills dismiss.",
  ],
  run: duplicates,
};
