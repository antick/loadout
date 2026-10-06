import { basename, isAbsolute } from "node:path";
import type { DeployMode, Skill } from "@loadout/shared";
import type { DeploymentRecord, SkillStore } from "../skills/store";
import { lstatOrNull, targetIdentity } from "../util/fs";
import { hashDir } from "../util/hash";
import type { OwnershipPolicy, TargetState } from "./engine";

/**
 * The hash of the folder at the row's path, when it is a real folder; null when it is missing
 * (rewriting loses nothing) or a link or file (the engine refuses those on its own).
 */
function folderHashAt(row: DeploymentRecord): string | null {
  const stat = lstatOrNull(row.targetPath);
  if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) return null;
  return hashDir(row.targetPath);
}

const changedSince = (row: DeploymentRecord, hash: string): boolean =>
  row.sourceHash === null || hash !== row.sourceHash;

/** The copy at the row's path differs from the content it was made from. */
export function copyWasEdited(row: DeploymentRecord): boolean {
  const hash = folderHashAt(row);
  return hash !== null && changedSince(row, hash);
}

/**
 * A copy in an agent's folder holds the user's own edits: it was changed there and differs from
 * the library's content too (a pull may have put that there, which loses nothing). The copy is
 * hashed once.
 */
export function holdsOwnEdits(row: DeploymentRecord, libraryHash: string | null): boolean {
  if (row.mode !== "copy") return false;
  const hash = folderHashAt(row);
  return hash !== null && changedSince(row, hash) && hash !== libraryHash;
}

export function samePath(a: string, b: string): boolean {
  return a === b || targetIdentity(a) === targetIdentity(b);
}

/**
 * Every row that points at `targetPath`, whichever agent or skill it belongs to. Agents can share
 * one folder, so ownership is a property of the path, not of a (skill, agent) pair.
 */
export function rowsAtPath(rows: DeploymentRecord[], targetPath: string): DeploymentRecord[] {
  const name = basename(targetPath);
  const identity = targetIdentity(targetPath);
  // Comparing the last segment first keeps the filesystem lookups to the few rows that can match.
  return rows.filter(
    (row) => basename(row.targetPath) === name && targetIdentity(row.targetPath) === identity,
  );
}

/** Every row that points at `targetPath`, read from the store without loading every row. */
export function storedRowsAtPath(store: SkillStore, targetPath: string): DeploymentRecord[] {
  return rowsAtPath(store.deploymentsNamed(basename(targetPath)), targetPath);
}

/** Rows that disagree on how the path was written prove nothing, so nothing may be replaced. */
export function policyFromRows(rows: DeploymentRecord[]): OwnershipPolicy {
  const modes = new Set(rows.map((row) => row.mode));
  const [mode] = modes;
  return modes.size === 1 && mode ? { kind: "recorded", mode } : { kind: "no_clobber" };
}

/**
 * True when the target already holds this skill's current content, so writing would change
 * nothing. A link to the library is current whenever links are wanted. A copy is current only
 * while every row proves it was made from the library's present content; that includes a copy
 * left by an earlier link fallback, so a wanted link does not force a rewrite.
 */
export function isCurrent(
  state: TargetState,
  rows: DeploymentRecord[],
  skill: Skill,
  mode: DeployMode,
): boolean {
  if (state === "link_to_source") return mode === "symlink";
  if (state !== "real_dir" || !skill.contentHash) return false;
  return (
    rows.length > 0 &&
    rows.every((row) => row.mode === "copy" && row.sourceHash === skill.contentHash)
  );
}

/**
 * A skill whose recorded source is a folder that is about to be replaced (or removed) would lose
 * its source, or end up pointing at a link to itself. Its library copy becomes the source.
 */
export function repointSources(store: SkillStore, localPath: string): void {
  for (const skill of store.list()) {
    const ref = skill.sourceRef;
    if (!ref || !isAbsolute(ref) || !samePath(ref, localPath)) continue;
    store.patch(skill.id, { sourceRef: skill.libraryPath });
  }
}
