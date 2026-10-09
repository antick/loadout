import type { PendingRemoval, Skill } from "@loadout/shared";
import { holdsOwnEdits } from "../deploy/evidence";
import { invalid } from "../errors";
import { hashAsLibraryCopy, libraryCopyOverrides } from "../skills/numbered-name";
import type { SkillStore } from "../skills/store";
import { lstatOrNull, targetIdentity } from "../util/fs";
import { fileDigests } from "../util/hash";
import { compareText } from "../util/text";
import { listRemovedPaths, listReplacedEdits, sortRemovals } from "./removals";
import { REMOVAL_IN_LIBRARY } from "@loadout/shared";

/**
 * Files in the library that differ from what the skill held when it last came from its source:
 * changed or added since, in the app's editor, another editor, by an agent or by hand. Empty
 * when that is not known (skills installed before it was recorded).
 */
function changedSinceInstall(store: SkillStore, skill: Skill): string[] {
  const snapshot = store.installed(skill.id);
  if (!snapshot) return [];
  return Object.entries(fileDigests(skill.libraryPath))
    .filter(([path, digest]) => snapshot.files[path] !== digest)
    .map(([path]) => path);
}

/**
 * Files of an edited copy that differ from the library skill it was made from. Those the agent
 * added are not among them: they are listed as removed.
 */
function copyEdits(fresh: Skill, copyDir: string): string[] {
  const library = fileDigests(fresh.libraryPath);
  return Object.entries(fileDigests(copyDir))
    .filter(([path, digest]) => library[path] !== undefined && library[path] !== digest)
    .map(([path]) => path);
}

/**
 * Everything the replacement would delete: from the library when its content changes, and from
 * every copy deployment that will be rebuilt. Agents sharing one folder are listed once.
 */
function pendingRemovals(
  store: SkillStore,
  fresh: Skill,
  sourceDir: string | null,
): PendingRemoval[] {
  const removals: PendingRemoval[] = [];
  if (sourceDir) {
    // An edited file the new version drops is listed once, as the edit the user would lose.
    const edited = [...fresh.editedFiles, ...changedSinceInstall(store, fresh)];
    // Compared with the library copy the source becomes: a kept name is no lost edit.
    const overrides = libraryCopyOverrides(sourceDir, fresh.dirName, fresh.name);
    const edits = listReplacedEdits(fresh.libraryPath, sourceDir, edited, overrides);
    const editSet = new Set(edits);
    for (const path of edits) removals.push({ location: REMOVAL_IN_LIBRARY, path, kind: "edited" });
    for (const path of listRemovedPaths(fresh.libraryPath, sourceDir)) {
      if (!editSet.has(path))
        removals.push({ location: REMOVAL_IN_LIBRARY, path, kind: "removed" });
    }
  }
  const rebuiltFrom = sourceDir ?? fresh.libraryPath;
  const seen = new Set<string>();
  const copies = store
    .deployments()
    .filter((row) => row.skillId === fresh.id && row.mode === "copy")
    .sort((a, b) => compareText(a.agentKey, b.agentKey));
  for (const row of copies) {
    // A copy made from the content that stays is not rewritten, so it loses nothing.
    if (!sourceDir && row.sourceHash === fresh.contentHash) continue;
    const identity = targetIdentity(row.targetPath);
    if (seen.has(identity)) continue;
    seen.add(identity);
    // Anything but a real folder is refused by the deploy engine and left untouched.
    if (!lstatOrNull(row.targetPath)?.isDirectory()) continue;
    // Files the user changed in the copy that the rebuild would overwrite: asked like any edit.
    const edits = holdsOwnEdits(row, fresh.contentHash) ? copyEdits(fresh, row.targetPath) : [];
    for (const path of listReplacedEdits(row.targetPath, rebuiltFrom, edits)) {
      removals.push({ location: row.agentKey, path, kind: "edited" });
    }
    for (const path of listRemovedPaths(row.targetPath, rebuiltFrom)) {
      removals.push({ location: row.agentKey, path, kind: "removed" });
    }
  }
  return sortRemovals(removals);
}

export interface Assessment {
  contentChanged: boolean;
  /** The new content's folder when the content changes; null when it stays. */
  changedDir: string | null;
  removals: PendingRemoval[];
}

/** What replacing `fresh` with the content in `sourceDir` would change, and what it would delete. */
export function assessReplacement(
  store: SkillStore,
  fresh: Skill,
  sourceDir: string | null,
): Assessment {
  const newHash = sourceDir
    ? hashAsLibraryCopy(sourceDir, fresh.dirName, {}, fresh.name)
    : fresh.contentHash;
  if (sourceDir && newHash === null) throw invalid("The source has no files to install");
  // Against the stored hash: a commit elsewhere in a big repository changes nothing here.
  const contentChanged = newHash !== fresh.contentHash;
  const changedDir = contentChanged ? sourceDir : null;
  return { contentChanged, changedDir, removals: pendingRemovals(store, fresh, changedDir) };
}
