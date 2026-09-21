import { createHash } from "node:crypto";
import { type Dirent, lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { PendingRemoval } from "@loadout/shared";
import { isIgnoredContentName } from "../util/hash";

/**
 * The removal guard: before an update replaces a folder, list what the user would lose, and only
 * go ahead when they approved exactly that list. Everything here is pure, apart from reading the
 * two trees it is asked to compare.
 */

/** `location` of removals inside the library copy; any other location is an agent key. */
export const LIBRARY_LOCATION = "library";
const DIR_SUFFIX = "/";
const SEPARATOR = "\0";

type EntryKind = "file" | "dir" | "link" | "other";

function kindOf(entry: Pick<Dirent, "isDirectory" | "isFile" | "isSymbolicLink">): EntryKind {
  if (entry.isSymbolicLink()) return "link";
  if (entry.isDirectory()) return "dir";
  return entry.isFile() ? "file" : "other";
}

/** What stands at `path`, without following links. Null when nothing does; other errors throw. */
function kindAt(path: string): EntryKind | null {
  try {
    return kindOf(lstatSync(path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Paths in `currentRoot` with no same-typed counterpart in `replacementRoot`, `/` separated and
 * sorted. A folder missing from the replacement is ONE entry with a trailing `/`, not one per
 * file. Names the content hash ignores (caches, OS litter) are never reported.
 *
 * A link in the replacement never counts as a counterpart: links are not copied into the
 * library, so whatever stands there today would be gone afterwards.
 * Read errors throw: when a tree cannot be inspected we refuse to guess what would be lost.
 */
export function listRemovedPaths(currentRoot: string, replacementRoot: string): string[] {
  if (kindAt(replacementRoot) !== "dir") {
    throw new Error(`Replacement folder is missing: ${replacementRoot}`);
  }
  const removed: string[] = [];
  const walk = (currentDir: string, replacementDir: string, prefix: string): void => {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      if (isIgnoredContentName(entry.name)) continue;
      const kind = kindOf(entry);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const counterpart = kindAt(join(replacementDir, entry.name));
      const kept = counterpart === kind && kind !== "link";
      if (kind === "dir") {
        if (kept)
          walk(join(currentDir, entry.name), join(replacementDir, entry.name), relativePath);
        else removed.push(relativePath + DIR_SUFFIX);
      } else if (!kept) {
        removed.push(relativePath);
      }
    }
  };
  if (kindAt(currentRoot) === "dir") walk(currentRoot, replacementRoot, "");
  return removed.sort(compareText);
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** One fixed order for the token and for display, so the same list always yields the same token. */
export function sortRemovals(removals: readonly PendingRemoval[]): PendingRemoval[] {
  return [...removals].sort(
    (a, b) => compareText(a.location, b.location) || compareText(a.path, b.path),
  );
}

/**
 * Token the caller sends back to approve a removal list. It covers the replacement's identity
 * (`domain`: the remote commit, "reimport", or the new source path) and every entry, so a moved
 * remote or a changed list no longer matches and the user is asked again.
 */
export function approvalToken(domain: string, removals: readonly PendingRemoval[]): string {
  const hash = createHash("sha256").update(domain).update(SEPARATOR);
  for (const removal of sortRemovals(removals)) {
    hash.update(`${removal.location}${SEPARATOR}${removal.path}${SEPARATOR}`);
  }
  return hash.digest("hex");
}

/** True when `approval` approves exactly this list for this replacement. */
export function isApproved(
  approval: string | null | undefined,
  domain: string,
  removals: readonly PendingRemoval[],
): boolean {
  return removals.length === 0 || approval === approvalToken(domain, removals);
}
