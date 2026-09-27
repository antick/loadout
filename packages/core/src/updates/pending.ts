import type { PendingRemoval, Skill } from "@loadout/shared";
import type { SkillStore } from "../skills/store";
import { lstatOrNull, targetIdentity } from "../util/fs";
import { fileDigests } from "../util/hash";
import { LIBRARY_LOCATION, listRemovedPaths, listReplacedEdits, sortRemovals } from "./removals";

/**
 * Files in the library that differ from what the skill held when it last came from its source:
 * changed or added since, in the app's editor, another editor, by an agent or by hand. Empty
 * when that is not known (skills installed before it was recorded).
 */
export function changedSinceInstall(store: SkillStore, skill: Skill): string[] {
  const snapshot = store.installed(skill.id);
  if (!snapshot) return [];
  return Object.entries(fileDigests(skill.libraryPath))
    .filter(([path, digest]) => snapshot.files[path] !== digest)
    .map(([path]) => path);
}

/**
 * Everything the replacement would delete: from the library when its content changes, and from
 * every copy deployment that will be rebuilt. Agents sharing one folder are listed once.
 */
export function pendingRemovals(
  store: SkillStore,
  fresh: Skill,
  sourceDir: string | null,
): PendingRemoval[] {
  const removals: PendingRemoval[] = [];
  if (sourceDir) {
    // An edited file the new version drops is listed once, as the edit the user would lose.
    const edited = [...fresh.editedFiles, ...changedSinceInstall(store, fresh)];
    const edits = listReplacedEdits(fresh.libraryPath, sourceDir, edited);
    const editSet = new Set(edits);
    for (const path of edits) removals.push({ location: LIBRARY_LOCATION, path, kind: "edited" });
    for (const path of listRemovedPaths(fresh.libraryPath, sourceDir)) {
      if (!editSet.has(path)) removals.push({ location: LIBRARY_LOCATION, path, kind: "removed" });
    }
  }
  const rebuiltFrom = sourceDir ?? fresh.libraryPath;
  const seen = new Set<string>();
  const copies = store
    .deployments()
    .filter((row) => row.skillId === fresh.id && row.mode === "copy")
    .sort((a, b) => (a.agentKey < b.agentKey ? -1 : 1));
  for (const row of copies) {
    // A copy made from the content that stays is not rewritten, so it loses nothing.
    if (!sourceDir && row.sourceHash === fresh.contentHash) continue;
    const identity = targetIdentity(row.targetPath);
    if (seen.has(identity)) continue;
    seen.add(identity);
    // Anything but a real folder is refused by the deploy engine and left untouched.
    if (!lstatOrNull(row.targetPath)?.isDirectory()) continue;
    for (const path of listRemovedPaths(row.targetPath, rebuiltFrom)) {
      removals.push({ location: row.agentKey, path, kind: "removed" });
    }
  }
  return sortRemovals(removals);
}
