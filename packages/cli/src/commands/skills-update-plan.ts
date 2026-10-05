import { redactUrl, formatRevision } from "@loadout/shared";
import { type Core, LIBRARY_LOCATION, errorMessage, isRemoteSource } from "@loadout/core";
import type { BatchFailure, FileDiffEntry, PendingRemoval, Skill } from "@loadout/shared";

import { failureLines, plural } from "../output";

/** What `skills update --dry-run` found for one skill. Nothing is written. */
export interface UpdatePlanRow {
  id: string;
  name: string;
  /** Where it would update from, without credentials. */
  source: string | null;
  /** The upstream revision compared, when the source has one. */
  revision: string | null;
  added: string[];
  modified: string[];
  removed: string[];
  /**
   * Files that stop a plain update: ones it would delete, and edits made in the app it would
   * replace. `--approve-removals` lets it go ahead.
   */
  heldBack: string[];
  /** The source could not be read; the rest is empty then. */
  error: string | null;
}

export interface UpdatePlan {
  dryRun: true;
  skills: UpdatePlanRow[];
  /** Skills whose source check failed (`--all`): nobody knows whether they would change. */
  failed: BatchFailure[];
}

/** Characters of a revision shown in the text. */
const FILES_SHOWN = 8;

/** A skill with somewhere to update from: a repository, the marketplace, a folder or an archive. */
export function hasUpdateSource(skill: Skill): boolean {
  return isRemoteSource(skill) || skill.sourceRef !== null;
}

/** "Git (https://github.com/acme/skills)": the kind of source and where it is. */
function whereFrom(skill: Skill, label: string): string {
  const ref = skill.sourceUrl ?? skill.sourceRef;
  return ref ? `${label} (${redactUrl(ref)})` : label;
}

const pathsWith = (entries: readonly FileDiffEntry[], status: FileDiffEntry["status"]): string[] =>
  entries.filter((entry) => entry.status === status).map((entry) => entry.path);

/** A file the update would delete or replace; one in an agent's copy names the agent. */
const heldBackPath = (removal: PendingRemoval): string =>
  removal.location === LIBRARY_LOCATION ? removal.path : `${removal.location}: ${removal.path}`;

/**
 * Compare one skill with its source, the way the Compare tab does. What it would hold back comes
 * from the update itself, run dry, so it is the same rule the real update uses.
 */
export async function planUpdate(core: Core, skill: Skill): Promise<UpdatePlanRow> {
  const empty = { added: [], modified: [], removed: [], heldBack: [] };
  try {
    const diff = await core.api.updates.sourceDiff(skill.id, { asLibraryCopy: true });
    const removed = pathsWith(diff.entries, "removed");
    const modified = pathsWith(diff.entries, "modified");
    const dry = isRemoteSource(skill)
      ? await core.api.updates.update(skill.id, null, { dryRun: true })
      : await core.api.updates.reimport(skill.id, null, { dryRun: true });
    return {
      id: skill.id,
      name: skill.name,
      source: whereFrom(skill, diff.sourceLabel),
      // Folders and archives have no revision worth showing.
      revision: isRemoteSource(skill) ? diff.revision : null,
      added: pathsWith(diff.entries, "added"),
      modified,
      removed,
      heldBack: dry.pendingRemovals.map(heldBackPath),
      error: null,
    };
  } catch (error) {
    return {
      id: skill.id,
      name: skill.name,
      source: null,
      revision: null,
      ...empty,
      error: errorMessage(error),
    };
  }
}

const changeCount = (row: UpdatePlanRow): number =>
  row.added.length + row.modified.length + row.removed.length;

function rowText(row: UpdatePlanRow): string[] {
  if (row.error) return [`${row.name}: could not read its source (${row.error}).`];
  if (changeCount(row) === 0)
    return [`${row.name}: already matches ${row.source ?? "its source"}.`];
  const at = row.revision ? ` at ${formatRevision(row.revision)}` : "";
  const lines = [
    `${row.name}: would update from ${row.source ?? "its source"}${at}, ${plural(changeCount(row), "file")} change:`,
  ];
  const listed = [
    ...row.added.map((path) => `  + ${path}`),
    ...row.modified.map((path) => `  ~ ${path}`),
    ...row.removed.map((path) => `  - ${path}`),
  ];
  lines.push(...listed.slice(0, FILES_SHOWN));
  if (listed.length > FILES_SHOWN) lines.push(`  … and ${listed.length - FILES_SHOWN} more`);
  if (row.heldBack.length > 0) {
    lines.push(
      `  Held back without --approve-removals: it deletes or replaces ${plural(row.heldBack.length, "file")} (${row.heldBack.join(", ")}).`,
    );
  }
  return lines;
}

/** Skills whose source check failed: not "nothing to update", but "nobody knows". */
export function checkFailureLines(failed: readonly BatchFailure[]): string[] {
  if (failed.length === 0) return [];
  return [
    `Could not check ${plural(failed.length, "skill")}, so whether they have updates is unknown:`,
    ...failureLines(failed),
  ];
}

export function updatePlanText(plan: UpdatePlan): string {
  const due = plan.skills.filter((row) => !row.error && changeCount(row) > 0).length;
  return [
    `Dry run: nothing was updated. ${plural(due, "skill")} would change.`,
    ...plan.skills.flatMap(rowText),
    ...checkFailureLines(plan.failed),
  ].join("\n");
}
