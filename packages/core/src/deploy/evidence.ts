import { basename } from "node:path";
import type { DeployMode, Skill } from "@skillboard/shared";
import type { DeploymentRecord } from "../skills/store";
import { targetIdentity } from "../util/fs";
import type { OwnershipPolicy, TargetState } from "./engine";

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
