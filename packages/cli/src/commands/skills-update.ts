import { errorMessage, isRemoteSource } from "@loadout/core";
import type { BatchUpdateResult, Skill, UpdateResult } from "@loadout/shared";
import { UsageError, flagBoolean } from "../args";
import { fields, plural, when } from "../output";
import { type UpdatePlan, hasUpdateSource, planUpdate, updatePlanText } from "./skills-update-plan";
import { ACCEPT_RISK_FLAG, DRY_RUN_FLAG, limitPositionals } from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";
import { exitCodeFor } from "../exit-codes";

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
  description: "Go ahead even when the update deletes files or replaces your edits.",
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

/** What to do about a skill its source no longer has: nothing can update it. */
const goneNext = (name: string): string =>
  `sources mine ${name} keeps it as yours; skills remove ${name} --yes deletes it`;

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
      ["Next", value.updateStatus === "source_missing" ? goneNext(value.name) : null],
    ]);
    return { value, text };
  }
  const batch = await core.api.updates.checkAll(force);
  const listed = await core.api.skills.list();
  const available = listed
    .filter((skill) => skill.updateStatus === "update_available")
    .map(checkView);
  const gone = listed.filter((skill) => skill.updateStatus === "source_missing").map(checkView);
  const lines = [
    `Checked ${plural(batch.succeeded, "skill")}; ${available.length} can be updated.`,
  ];
  for (const skill of available) lines.push(`  ${skill.name}`);
  if (gone.length > 0) {
    lines.push(`Gone from their source (${gone.length}), so they cannot update:`);
    for (const skill of gone) lines.push(`  ${skill.name}: ${goneNext(skill.name)}`);
  }
  for (const failure of batch.failed) lines.push(`Failed: ${failure.name} - ${failure.message}`);
  return {
    value: {
      checked: batch.succeeded,
      failed: batch.failed,
      updateAvailable: available,
      sourceMissing: gone,
    },
    text: lines.join("\n"),
    exitCode: exitCodeFor(batch.failed.length > 0),
  };
}

const updateView = (result: UpdateResult) => ({
  skill: checkView(result.skill),
  contentChanged: result.contentChanged,
  /** Files the update would delete or edits it would replace. Non-empty: nothing was changed. */
  pendingRemovals: result.pendingRemovals,
  applied: result.pendingRemovals.length === 0,
});

/**
 * Update from a repository, or re-import a folder, archive or archive link: the same choice
 * `updateMany` makes.
 */
async function updateOne(context: CommandContext, skillId: string): Promise<UpdateResult> {
  const { core, args } = context;
  const remote = isRemoteSource(core.store.get(skillId));
  const options = { acceptRisk: flagBoolean(args, ACCEPT_RISK_FLAG.name) };
  const refresh = (approval?: string | null): Promise<UpdateResult> =>
    remote
      ? core.api.updates.update(skillId, approval, options)
      : core.api.updates.reimport(skillId, approval, options);
  const first = await refresh();
  if (first.pendingRemovals.length === 0 || !flagBoolean(args, APPROVE_FLAG.name)) return first;
  return refresh(first.approval);
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

/** `--dry-run`: compare with the source, list what would change and what would be held back. */
async function planUpdates(context: CommandContext, one: Skill | null): Promise<CommandResult> {
  const { core } = context;
  // `--all` updates only skills a check finds newer upstream: the dry run looks at the same ones.
  let skills: Skill[] = one ? [one] : [];
  if (!one) {
    await core.api.updates.checkAll(false);
    skills = (await core.api.skills.list()).filter(
      (skill) => hasUpdateSource(skill) && skill.updateStatus === "update_available",
    );
  }
  const value: UpdatePlan = { dryRun: true, skills: [] };
  for (const skill of skills) value.skills.push(await planUpdate(core, skill));
  return {
    value,
    text: updatePlanText(value),
    exitCode: exitCodeFor(value.skills.some((row) => row.error)),
  };
}

async function update(context: CommandContext): Promise<CommandResult> {
  const { core, args } = context;
  const one = target(context);
  if (flagBoolean(args, DRY_RUN_FLAG.name)) return planUpdates(context, one);
  // Accepting findings is a choice about one skill whose findings were read, never a batch.
  if (!one && flagBoolean(args, ACCEPT_RISK_FLAG.name)) {
    throw new UsageError(`--${ACCEPT_RISK_FLAG.name} works on one skill at a time, not --all.`);
  }
  if (one) {
    const value = updateView(await updateOne(context, one.id));
    const lines = value.applied
      ? [`${value.skill.name}: ${value.contentChanged ? "updated" : "already up to date"}.`]
      : [
          `${value.skill.name} was NOT updated: the update would delete or replace ${plural(value.pendingRemovals.length, "file")}.`,
          ...value.pendingRemovals.map(
            (removal) =>
              `  ${removal.location}: ${removal.path}${removal.kind === "edited" ? " (your edit)" : ""}`,
          ),
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
    lines.push(
      `Held back because files would be deleted or edits replaced: ${value.heldBack.join(", ")}`,
    );
  }
  for (const failure of value.failed) lines.push(`Failed: ${failure.name} - ${failure.message}`);
  return { value, text: lines.join("\n"), exitCode: exitCodeFor(value.failed.length > 0) };
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
  usage: "[<ref> | --all] [--approve-removals] [--accept-risk] [--dry-run]",
  flags: [ALL_FLAG, APPROVE_FLAG, ACCEPT_RISK_FLAG, DRY_RUN_FLAG],
  notes: [
    "--dry-run compares with the source and lists the files that would change, and whether the update would be held back; the library is not touched. With --all it checks for updates first (like `skills check --all`) and lists the skills the real run would update.",
    "An update that would delete files or replace edits made in the app is held back and listed; that is a safety stop, not an error.",
  ],
  run: update,
};
