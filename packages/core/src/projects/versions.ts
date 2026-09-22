import type { LocalSkill, SkillVersion } from "@loadout/shared";
import { readSkillDocument } from "../skills/metadata";
import { toPosix } from "../util/fs";
import { hashDir, listContentFiles, newestContentMtime } from "../util/hash";

/** Copies of one project skill that hold exactly the same files. */
export interface VersionGroup {
  hash: string | null;
  copies: LocalSkill[];
}

/**
 * The copies of a project skill, grouped by content: copies in one group are identical, so any
 * of them speaks for the others. Groups are ordered by their newest change, newest first.
 */
export function groupByContent(copies: readonly LocalSkill[]): VersionGroup[] {
  const groups = new Map<string, VersionGroup>();
  for (const copy of copies) {
    const hash = hashDir(copy.path);
    // An empty or unreadable folder matches nothing, not even another empty one.
    const key = hash ?? `empty:${copy.path}`;
    const group = groups.get(key) ?? { hash, copies: [] };
    group.copies.push(copy);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => (changedAt(b) ?? 0) - (changedAt(a) ?? 0));
}

function changedAt(group: VersionGroup): number | null {
  const first = group.copies[0];
  return first ? newestContentMtime(first.path) : null;
}

/** A group as the app shows it when the user has to pick one. */
export function describeVersion(group: VersionGroup, libraryHash: string | null): SkillVersion {
  const first = group.copies[0];
  const found = first ? readSkillDocument(first.path) : null;
  return {
    id: group.hash ?? "",
    agents: group.copies.map((copy) => ({
      agentKey: copy.agentKey,
      agentName: copy.agentDisplayName,
    })),
    changedAt: changedAt(group),
    fileCount: first ? listContentFiles(first.path).length : 0,
    documentName: found ? toPosix(found.filename) : "",
    document: found?.content ?? "",
    matchesLibrary: group.hash !== null && group.hash === libraryHash,
  };
}
