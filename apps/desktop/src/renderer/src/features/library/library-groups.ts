import { CLAWHUB_NAME, type Skill, type SkillSourceIdentity, skillSourceOf } from "@loadout/shared";

/** Skills without a shared source (made here, imported from a folder) go under this key. */
const NO_SOURCE_GROUP = "__none__";

export interface LibraryGroup {
  key: string;
  /** Null for the "no source" group. */
  source: SkillSourceIdentity | null;
  /** In the list's own order. */
  skills: Skill[];
}

/**
 * The listed skills by where they came from: one group per repository, archive or link, sorted
 * by label, then everything without a source last. Skills keep the order they were given in.
 */
export function groupLibraryBySource(skills: readonly Skill[]): LibraryGroup[] {
  const groups = new Map<string, LibraryGroup>();
  const unsourced: LibraryGroup = { key: NO_SOURCE_GROUP, source: null, skills: [] };
  for (const skill of skills) {
    const found = skillSourceOf(skill);
    if (!found) {
      unsourced.skills.push(skill);
      continue;
    }
    // Registry skills are one source each; in the library they read better as one section.
    const source: SkillSourceIdentity =
      found.kind === "registry"
        ? { ...found, key: "registry:clawhub", label: CLAWHUB_NAME }
        : found;
    const group = groups.get(source.key) ?? { key: source.key, source, skills: [] };
    group.skills.push(skill);
    groups.set(source.key, group);
  }
  const sorted = [...groups.values()].sort((a, b) =>
    (a.source?.label ?? "").localeCompare(b.source?.label ?? "", undefined, {
      sensitivity: "base",
    }),
  );
  return unsourced.skills.length > 0 ? [...sorted, unsourced] : sorted;
}
