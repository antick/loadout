import { errorMessage } from "@skillboard/core";
import type { BatchUpdateResult, Skill, UpdateResult } from "@skillboard/shared";
import { UsageError, flagBoolean } from "../args";
import { fields, plural, when } from "../output";
import { limitPositionals } from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";

const ALL_FLAG = {
  name: "all",
  type: "boolean",
  description: "Every skill in the library.",
} as const;
const FORCE_FLAG = {
  name: "force",
  type: "boolean",
  description: "Ignore the recent-check cache and ask upstream again.",
} as const;
const APPROVE_FLAG = {
  name: "approve-removals",
  type: "boolean",
  description: "Go ahead even when the update deletes files.",
} as const;

/** Exactly one of `<ref>` and `--all`. */
function target(context: CommandContext): Skill | null {
  const { core, args } = context;
  limitPositionals(args, 1);
  const ref = args.positionals[0];
  const all = flagBoolean(args, ALL_FLAG.name);
  if ((ref === undefined) === !all) throw new UsageError("Give one skill, or --all.");
  return ref === undefined ? null : core.store.resolve(ref);
}

const checkView = (skill: Skill) => ({
  id: skill.id,
  name: skill.name,
  updateStatus: skill.updateStatus,
  sourceRevision: skill.sourceRevision,
  remoteRevision: skill.remoteRevision,
  lastCheckedAt: skill.lastCheckedAt,
  lastCheckError: skill.lastCheckError,
});

async function check(context: CommandContext): Promise<CommandResult> {
  const { core, args } = context;
  const force = flagBoolean(args, FORCE_FLAG.name);
  const one = target(context);
  if (one) {
    const value = checkView(await core.api.updates.check(one.id, force));
    const text = fields([
      ["Skill", value.name],
      ["Status", value.updateStatus],
      ["Checked", when(value.lastCheckedAt)],
      ["Problem", value.lastCheckError],
    ]);
    return { value, text };
  }
  const batch = await core.api.updates.checkAll(force);
  const available = (await core.api.skills.list())
    .filter((skill) => skill.updateStatus === "update_available")
    .map(checkView);
  const lines = [
    `Checked ${plural(batch.succeeded, "skill")}; ${available.length} can be updated.`,
  ];
  for (const skill of available) lines.push(`  ${skill.name}`);
  for (const failure of batch.failed) lines.push(`Failed: ${failure.name} - ${failure.message}`);
  return {
    value: { checked: batch.succeeded, failed: batch.failed, updateAvailable: available },
    text: lines.join("\n"),
    exitCode: batch.failed.length > 0 ? 1 : 0,
  };
}

const updateView = (result: UpdateResult) => ({
  skill: checkView(result.skill),
  contentChanged: result.contentChanged,
  /** Files the update would delete. Non-empty means nothing was changed. */
  pendingRemovals: result.pendingRemovals,
  applied: result.pendingRemovals.length === 0,
});

async function updateOne(context: CommandContext, skillId: string): Promise<UpdateResult> {
  const { core, args } = context;
  const first = await core.api.updates.update(skillId);
  if (first.pendingRemovals.length === 0 || !flagBoolean(args, APPROVE_FLAG.name)) return first;
  return core.api.updates.update(skillId, first.approval);
}

/** `updateMany` has no way to approve removals, so an approved bulk run goes skill by skill. */
async function updateEachApproved(
  context: CommandContext,
  skills: readonly Skill[],
): Promise<BatchUpdateResult> {
  const result: BatchUpdateResult = { updated: 0, unchanged: 0, heldBack: [], failed: [] };
  for (const skill of skills) {
    try {
      const outcome = await updateOne(context, skill.id);
      if (outcome.pendingRemovals.length > 0) result.heldBack.push(skill.name);
      else if (outcome.contentChanged) result.updated += 1;
      else result.unchanged += 1;
    } catch (error) {
      result.failed.push({ name: skill.name, message: errorMessage(error) });
    }
  }
  return result;
}

async function update(context: CommandContext): Promise<CommandResult> {
  const { core, args } = context;
  const one = target(context);
  if (one) {
    const value = updateView(await updateOne(context, one.id));
    const lines = value.applied
      ? [`${value.skill.name}: ${value.contentChanged ? "updated" : "already up to date"}.`]
      : [
          `${value.skill.name} was NOT updated: the update would delete ${plural(value.pendingRemovals.length, "file")}.`,
          ...value.pendingRemovals.map((removal) => `  ${removal.location}: ${removal.path}`),
          `Run again with --${APPROVE_FLAG.name} to accept that.`,
        ];
    return { value, text: lines.join("\n") };
  }

  await core.api.updates.checkAll(false);
  const due = (await core.api.skills.list()).filter((s) => s.updateStatus === "update_available");
  const value = flagBoolean(args, APPROVE_FLAG.name)
    ? await updateEachApproved(context, due)
    : await core.api.updates.updateMany(due.map((skill) => skill.id));
  const lines = [`${plural(value.updated, "skill")} updated, ${value.unchanged} unchanged.`];
  if (value.heldBack.length > 0) {
    lines.push(`Held back because files would be deleted: ${value.heldBack.join(", ")}`);
  }
  for (const failure of value.failed) lines.push(`Failed: ${failure.name} - ${failure.message}`);
  return { value, text: lines.join("\n"), exitCode: value.failed.length > 0 ? 1 : 0 };
}

export const checkCommand: CommandSpec = {
  name: "check",
  summary: "Ask upstream whether skills have updates",
  usage: "[<ref> | --all] [--force]",
  flags: [ALL_FLAG, FORCE_FLAG],
  run: check,
};

export const updateCommand: CommandSpec = {
  name: "update",
  summary: "Bring skills up to date with their source",
  usage: "[<ref> | --all] [--approve-removals]",
  flags: [ALL_FLAG, APPROVE_FLAG],
  notes: [
    "An update that would delete files is held back and listed; that is a safety stop, not an error.",
  ],
  run: update,
};
