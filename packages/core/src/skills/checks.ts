import { basename, join } from "node:path";
import {
  type SkillBehaviorField,
  type SkillIssue,
  type SkillTrait,
  checkSkillDocument,
  mergeTraits,
  skillIssue,
  errorMessage,
} from "@loadout/shared";
import { canonicalPath, isInside, lstatOrNull } from "../util/fs";
import { parseFrontmatter, readMarkerDocument } from "./metadata";
import { folderTraits } from "./traits";

/** What the checks need to know about a library skill. */
export interface InspectedSkill {
  id: string;
  libraryPath: string;
  contentHash: string | null;
}

/** What reading a skill's folder tells about it beyond its database row. */
export interface SkillFacts {
  issues: SkillIssue[];
  /** The frontmatter sets `disable-model-invocation: true`. */
  manualOnly: boolean;
  /** What the skill can make an agent do beyond reading it (scripts, hooks, MCP, tools). */
  traits: SkillTrait[];
  /** Fields it uses that some agents skip; see `fieldNotesFor`. */
  behaviorFields: SkillBehaviorField[];
}

/** Checks of skills, remembered per content hash so listing the library stays cheap. */
export interface SkillInspector {
  factsOf(skill: InspectedSkill): SkillFacts;
}

/** A linked file or folder is there, and a link inside the skill does not lead out of it. */
function referenceExists(root: string, relativePath: string): boolean {
  const target = join(root, ...relativePath.split("/"));
  if (!lstatOrNull(target)) return false;
  return isInside(canonicalPath(root), canonicalPath(target));
}

/** Every check of one skill folder, reading its files. */
export function inspectSkillFolder(dir: string, document = readMarkerDocument(dir)): SkillIssue[] {
  const { issues, references, referenceLines } = checkSkillDocument(document, basename(dir));
  const broken = references
    .filter((path) => !referenceExists(dir, path))
    .map((path) => skillIssue("broken_reference", { path }, referenceLines[path]));
  return [...issues, ...broken].sort(
    (a, b) => Number(b.severity === "error") - Number(a.severity === "error"),
  );
}

/** Every check of one skill folder plus the frontmatter flags shown next to it. */
function inspectSkillFacts(dir: string): SkillFacts {
  const document = readMarkerDocument(dir);
  const frontmatter = parseFrontmatter(document ?? "");
  return {
    issues: inspectSkillFolder(dir, document),
    manualOnly: frontmatter.manualOnly,
    traits: mergeTraits(frontmatter.traits, folderTraits(dir)),
    behaviorFields: frontmatter.behaviorFields,
  };
}

export function createSkillInspector(): SkillInspector {
  const cache = new Map<string, { key: string; facts: SkillFacts }>();
  return {
    factsOf: (skill) => {
      // Without a hash nothing tells us the folder is unchanged, so look again.
      const key = skill.contentHash ? `${skill.libraryPath}\0${skill.contentHash}` : null;
      const cached = cache.get(skill.id);
      if (key && cached?.key === key) return cached.facts;
      let facts: SkillFacts;
      try {
        facts = inspectSkillFacts(skill.libraryPath);
      } catch (error) {
        // One unreadable skill must never stop the whole library from listing.
        const reason = errorMessage(error);
        facts = {
          issues: [skillIssue("frontmatter_invalid", { reason }, 1)],
          manualOnly: false,
          traits: [],
          behaviorFields: [],
        };
      }
      if (key) cache.set(skill.id, { key, facts });
      return facts;
    },
  };
}
