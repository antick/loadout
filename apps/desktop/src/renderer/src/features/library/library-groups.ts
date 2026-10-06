import {
  CLAWHUB_NAME,
  compareNames,
  type Skill,
  type SkillSourceIdentity,
  skillSourceOf,
} from "@loadout/shared";

/** Skills without a shared source (made here, imported from a folder) go under this key. */
const NO_SOURCE_GROUP = "__none__";
/** Registry skills are one source each; in the library they read better as one section. */
const REGISTRY_GROUP = "registry:clawhub";

export interface LibraryGroup {
  key: string;
  /** Null for the "no source" group. */
  source: SkillSourceIdentity | null;
  /** In the list's own order. */
  skills: Skill[];
}

function compareLabels(a: LibraryGroup, b: LibraryGroup): number {
  return compareNames(a.source?.label ?? "", b.source?.label ?? "");
}

/** The library group a source belongs to: registry sources fold into one. */
function groupIdentity(source: SkillSourceIdentity): SkillSourceIdentity {
  return source.kind === "registry"
    ? { ...source, key: REGISTRY_GROUP, label: CLAWHUB_NAME }
    : source;
}

/**
 * The listed skills by where they came from: one group per repository, archive or link, sorted
 * by label, then everything without a source last. Skills keep the order they were given in.
 */
export function groupLibraryBySource(skills: readonly Skill[]): LibraryGroup[] {
  const groups = new Map<string, LibraryGroup>();
  const unsourced: Skill[] = [];
  for (const skill of skills) {
    const found = skillSourceOf(skill);
    if (!found) {
      unsourced.push(skill);
      continue;
    }
    const source = groupIdentity(found);
    const group = groups.get(source.key) ?? { key: source.key, source, skills: [] };
    group.skills.push(skill);
    groups.set(source.key, group);
  }
  const sorted = [...groups.values()].sort(compareLabels);
  return unsourced.length > 0
    ? [...sorted, { key: NO_SOURCE_GROUP, source: null, skills: unsourced }]
    : sorted;
}
