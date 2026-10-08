import { type Core, FLAGGED_UPDATE, isAppError } from "@loadout/core";
import { type BatchFailure, type Skill, type UpdateResult, formatDateTime } from "@loadout/shared";
import { UsageError, flagBoolean } from "../args";
import { failureLines, fields, plural } from "../output";
import {
  type UpdatePlan,
  checkFailureLines,
  planUpdate,
  updatePlanText,
} from "./skills-update-plan";
import { ACCEPT_RISK_FLAG, DRY_RUN_FLAG, allSkillsFlag, refsOrAll } from "./support";
import type { CommandContext, CommandResult, CommandSpec } from "./types";
import { exitCodeFor } from "../exit-codes";

const ALL_FLAG = allSkillsFlag();
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
  const [ref] = refsOrAll(args, "one skill", 1) ?? [];
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
    const skill = checkView(await core.api.updates.check(one.id, force));
    const text = fields([
      ["Skill", skill.name],
      ["Status", skill.updateStatus],
      ["Checked", formatDateTime(skill.lastCheckedAt)],
      ["Problem", skill.lastCheckError],
      ["Next", skill.updateStatus === "source_missing" ? goneNext(skill.name) : null],
    ]);
    // "error": the check itself failed, so nobody knows whether there is an update.
    const failed = skill.updateStatus === "error";
    // The shape `--all` has, so a reader handles one.
    const value = {
      checked: failed ? 0 : 1,
      failed: failed ? [{ name: skill.name, message: skill.lastCheckError ?? "" }] : [],
      updateAvailable: skill.updateStatus === "update_available" ? [skill] : [],
      sourceMissing: skill.updateStatus === "source_missing" ? [skill] : [],
      skills: [skill],
    };
    return { value, text, exitCode: exitCodeFor(failed) };
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
  lines.push(...checkFailureLines(batch.failed));
  return {
    value: {
      checked: batch.succeeded,
      failed: batch.failed,
      updateAvailable: available,
      sourceMissing: gone,
      // Every skill with what its check found, as one skill gives it.
      skills: listed.map(checkView),
    },
    text: lines.join("\n"),
    exitCode: exitCodeFor(batch.failed.length > 0),
  };
}

/**
 * Asked to update everything: look upstream now, never at an answer kept from earlier, and take
 * the skills a check finds newer upstream. A skill whose check failed is not due, so the failures
 * come back too, or it would go unmentioned. A dry run saves nothing the check found.
 */
async function dueForUpdate(
  core: Core,
  dryRun: boolean,
): Promise<{ due: Skill[]; failed: BatchFailure[] }> {
  const checked = await core.api.updates.checkAll(true, { dryRun });
  const newer = new Set(checked.updateAvailable);
  const due = (await core.api.skills.list()).filter((skill) => newer.has(skill.id));
  return { due, failed: checked.failed };
}

/**
 * One skill's update, with the counts `--all` gives (`updated`, `unchanged`, `heldBack`,
 * `failed`), so a reader handles one shape.
 */
function updateView(result: UpdateResult) {
  const applied = result.pendingRemovals.length === 0;
  return {
    skill: checkView(result.skill),
    contentChanged: result.contentChanged,
    /** Files the update would delete or edits it would replace. Non-empty: nothing was changed. */
    pendingRemovals: result.pendingRemovals,
    applied,
    updated: applied && result.contentChanged ? 1 : 0,
    unchanged: applied && !result.contentChanged ? 1 : 0,
    heldBack: applied ? [] : [result.skill.name],
    failed: [] as BatchFailure[],
  };
}

async function updateOne(context: CommandContext, skillId: string): Promise<UpdateResult> {
  const { core, args } = context;
  const options = { acceptRisk: flagBoolean(args, ACCEPT_RISK_FLAG.name) };
  const first = await core.api.updates.update(skillId, null, options);
  if (first.pendingRemovals.length === 0 || !flagBoolean(args, APPROVE_FLAG.name)) return first;
  return core.api.updates.update(skillId, first.approval, options);
}

/** `--dry-run`: compare with the source, list what would change and what would be held back. */
async function planUpdates(context: CommandContext, one: Skill | null): Promise<CommandResult> {
  const { core, args } = context;
  const acceptRisk = flagBoolean(args, ACCEPT_RISK_FLAG.name);
  const value: UpdatePlan = { dryRun: true, skills: [], failed: [] };
  // One skill: a flagged new version stops the dry run as it stops the real one.
  if (one) value.skills.push(await planUpdate(core, one, acceptRisk));
  else {
    // `--all` updates only skills a check finds newer upstream: the dry run looks at the same
    // ones, and holds back a flagged one as the real run does.
    const { due, failed } = await dueForUpdate(core, true);
    value.failed = failed;
    for (const skill of due) {
      try {
        value.skills.push(await planUpdate(core, skill, false));
      } catch (error) {
        if (!isAppError(error, "UNSAFE")) throw error;
        value.failed.push({ name: skill.name, message: FLAGGED_UPDATE });
      }
    }
  }
  return {
    value,
    text: updatePlanText(value),
    exitCode: exitCodeFor(value.failed.length > 0 || value.skills.some((row) => row.error)),
  };
}

async function update(context: CommandContext): Promise<CommandResult> {
  const { core, args } = context;
  const one = target(context);
  // Accepting findings is a choice about one skill whose findings were read, never a batch.
  // Checked before the dry run splits off, so a preview refuses what the real run refuses.
  if (!one && flagBoolean(args, ACCEPT_RISK_FLAG.name)) {
    throw new UsageError(`--${ACCEPT_RISK_FLAG.name} works on one skill at a time, not --all.`);
  }
  if (flagBoolean(args, DRY_RUN_FLAG.name)) return planUpdates(context, one);
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
    return { value: { dryRun: false, ...value }, text: lines.join("\n") };
  }

  const checkedSince = Date.now();
  const checked = await dueForUpdate(core, false);
  const updated = await core.api.updates.updateMany(
    checked.due.map((skill) => skill.id),
    { checkedSince, approveRemovals: flagBoolean(args, APPROVE_FLAG.name) },
  );
  const value = { ...updated, failed: [...checked.failed, ...updated.failed] };
  const lines = [`${plural(value.updated, "skill")} updated, ${value.unchanged} unchanged.`];
  if (value.heldBack.length > 0) {
    lines.push(
      `Held back because files would be deleted or edits replaced: ${value.heldBack.join(", ")}`,
    );
  }
  lines.push(...checkFailureLines(checked.failed), ...failureLines(updated.failed));
  return {
    value: { dryRun: false, ...value },
    text: lines.join("\n"),
    exitCode: exitCodeFor(value.failed.length > 0),
  };
}

export const checkCommand: CommandSpec = {
  name: "check",
  summary: "Ask upstream whether skills have updates",
  usage: "<ref> | --all",
  flags: [ALL_FLAG, FORCE_FLAG],
  run: check,
};

export const updateCommand: CommandSpec = {
  name: "update",
  summary: "Bring skills up to date with their source",
  usage: "<ref> | --all",
  flags: [ALL_FLAG, APPROVE_FLAG, ACCEPT_RISK_FLAG, DRY_RUN_FLAG],
  notes: [
    "--dry-run compares with the source and lists the files that would change, and whether the update would be held back; the library is not touched. With --all it checks for updates first (like `skills check --all`, without saving what it found) and lists the skills the real run would update.",
    "An update that would delete files or replace edits made in the app is held back and listed; that is a safety stop, not an error.",
  ],
  run: update,
};
