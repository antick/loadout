import {
  CLAWHUB_NAME,
  type Skill,
  type SkillSource,
  type SkillSourceIdentity,
  groupSkillSources,
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
  return (a.source?.label ?? "").localeCompare(b.source?.label ?? "", undefined, {
    sensitivity: "base",
  });
}

/** One library group per source, registry sources folded into one. */
function groupOf(source: SkillSource): LibraryGroup {
  const identity: SkillSourceIdentity =
    source.kind === "registry" ? { ...source, key: REGISTRY_GROUP, label: CLAWHUB_NAME } : source;
  return { key: identity.key, source: identity, skills: [] };
}

/**
 * The listed skills by where they came from: one group per repository, archive or link, sorted
 * by label, then everything without a source last. Skills keep the order they were given in.
 */
export function groupLibraryBySource(skills: readonly Skill[]): LibraryGroup[] {
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  const groups = new Map<string, LibraryGroup>();
  for (const source of groupSkillSources(skills)) {
    const group = groups.get(groupOf(source).key) ?? groupOf(source);
    for (const skillId of source.skillIds) {
      const skill = byId.get(skillId);
      if (skill) group.skills.push(skill);
    }
    groups.set(group.key, group);
  }
  const sorted = [...groups.values()].sort(compareLabels);
  const unsourced = skills.filter((skill) => skillSourceOf(skill) === null);
  return unsourced.length > 0
    ? [...sorted, { key: NO_SOURCE_GROUP, source: null, skills: unsourced }]
    : sorted;
}
