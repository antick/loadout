import { readlinkSync, realpathSync, rmSync, rmdirSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { APP_NAME, type DeployMode } from "@loadout/shared";
import { invalid, notFound, targetConflict } from "../errors";
import {
  canonicalPath,
  copyDir,
  ensureDir,
  isDirectory,
  lstatOrNull,
  pathsOverlap,
  removePath,
  targetIdentity,
} from "../util/fs";

/** What sits at a deploy target, judged without ever following a link. */
export type TargetState = "absent" | "link_to_source" | "foreign_link" | "real_dir" | "real_file";

/**
 * Who is asking to replace a target, and what proof of ownership they hold.
 * `recorded` carries the mode the deployments table remembers for this path.
 */
export type OwnershipPolicy =
  | { kind: "no_clobber" }
  | { kind: "recorded"; mode: DeployMode }
  | { kind: "user_confirmed" };

export const REASON_UNMANAGED = `is not managed by ${APP_NAME}`;
export const REASON_MISMATCH = "does not match its recorded deployment";
export const REASON_IRREPLACEABLE = "cannot be replaced";

/** Error codes that mean "this link is a directory entry", seen for junctions on Windows. */
const UNLINK_AS_DIR_CODES: ReadonlySet<string> = new Set(["EPERM", "EISDIR"]);
const WINDOWS = process.platform === "win32";
/** Link flavours to try in order. A junction needs no privilege on Windows, a dir symlink does. */
const LINK_TYPES: readonly ("dir" | "junction")[] = WINDOWS ? ["dir", "junction"] : ["dir"];

/** The link's own text first (cheap, works for dangling sources), then both sides resolved. */
function linkPointsAt(linkPath: string, sourceDir: string): boolean {
  try {
    const raw = readlinkSync(linkPath);
    if (resolve(dirname(linkPath), raw) === resolve(sourceDir)) return true;
    return realpathSync(linkPath) === realpathSync(sourceDir);
  } catch {
    return false;
  }
}

export function classifyTarget(targetPath: string, sourceDir: string): TargetState {
  const stat = lstatOrNull(targetPath);
  if (!stat) return "absent";
  if (stat.isSymbolicLink()) {
    return linkPointsAt(targetPath, sourceDir) ? "link_to_source" : "foreign_link";
  }
  return stat.isDirectory() ? "real_dir" : "real_file";
}

/** Null when the policy may replace a target in this state, otherwise why it may not. */
export function authorize(state: TargetState, policy: OwnershipPolicy): string | null {
  if (state === "absent" || state === "link_to_source") return null;
  if (policy.kind === "user_confirmed") return null;
  if (policy.kind === "no_clobber") return REASON_UNMANAGED;
  if (state === "real_file") return REASON_IRREPLACEABLE;
  const recordedState: TargetState = policy.mode === "symlink" ? "foreign_link" : "real_dir";
  return state === recordedState ? null : REASON_MISMATCH;
}

/** Unlink a link without following it. Falls back to a non-recursive rmdir for junctions. */
function unlinkLink(path: string): void {
  try {
    unlinkSync(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "";
    if (!UNLINK_AS_DIR_CODES.has(code)) throw error;
    rmdirSync(path);
  }
}

/**
 * Remove exactly the kind of thing that was classified. If the path changed type in between,
 * the operation fails instead of deleting something nobody looked at.
 */
function removeClassified(targetPath: string, state: TargetState): void {
  if (state === "absent") return;
  if (state === "real_dir") {
    const stat = lstatOrNull(targetPath);
    if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) {
      throw targetConflict([{ path: targetPath, reason: REASON_MISMATCH }]);
    }
    rmSync(targetPath, { recursive: true });
    return;
  }
  if (state === "real_file") {
    unlinkSync(targetPath);
    return;
  }
  unlinkLink(targetPath);
}

function tryLink(sourceDir: string, targetPath: string): boolean {
  for (const type of LINK_TYPES) {
    try {
      symlinkSync(sourceDir, targetPath, type);
      return true;
    } catch {
      // Try the next flavour; the caller copies when none works.
    }
  }
  return false;
}

/** We created `targetPath` moments ago, so a half-written copy is ours to clean up. */
async function copyOrCleanUp(sourceDir: string, targetPath: string): Promise<void> {
  try {
    await copyDir(sourceDir, targetPath);
  } catch (error) {
    await removePath(targetPath);
    throw error;
  }
}

/**
 * Put `sourceDir` at `targetPath` as a link or a copy and return the mode actually used
 * (a link that cannot be created becomes a copy). Throws TARGET_CONFLICT, leaving the existing
 * content untouched, when `policy` does not cover what is there.
 */
export async function writeTarget(
  sourceDir: string,
  targetPath: string,
  mode: DeployMode,
  policy: OwnershipPolicy,
): Promise<DeployMode> {
  if (!isDirectory(sourceDir)) throw notFound(`The skill folder is missing: ${sourceDir}`);
  if (
    pathsOverlap(sourceDir, targetPath) ||
    pathsOverlap(canonicalPath(sourceDir), targetIdentity(targetPath))
  ) {
    throw invalid(`Cannot deploy a skill into itself: ${sourceDir} → ${targetPath}`);
  }
  if (mode === "symlink" && classifyTarget(targetPath, sourceDir) === "link_to_source") {
    return "symlink";
  }

  ensureDir(dirname(targetPath));
  const state = classifyTarget(targetPath, sourceDir);
  const refusal = authorize(state, policy);
  if (refusal) throw targetConflict([{ path: targetPath, reason: refusal }]);
  removeClassified(targetPath, state);

  if (mode === "symlink" && tryLink(sourceDir, targetPath)) return "symlink";
  await copyOrCleanUp(sourceDir, targetPath);
  return "copy";
}

/**
 * Remove a deployment, but only what its row recorded: a `symlink` row may remove a link, a
 * `copy` row may remove a real folder. Anything else is somebody's content and stays.
 */
export function removeTarget(targetPath: string, recordedMode: DeployMode): boolean {
  const stat = lstatOrNull(targetPath);
  if (!stat) return false;
  if (recordedMode === "symlink") {
    if (!stat.isSymbolicLink()) return false;
    unlinkLink(targetPath);
    return true;
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) return false;
  rmSync(targetPath, { recursive: true });
  return true;
}
