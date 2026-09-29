import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  SKILL_MARKER_FILES,
  type SkillBehaviourField,
  type SkillIssue,
  type SkillTrait,
  checkSkillDocument,
  skillIssue,
} from "@loadout/shared";
import { canonicalPath, isInside, lstatOrNull } from "../util/fs";
import { readFrontmatter } from "./metadata";
import { skillTraits } from "./traits";

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
  behaviourFields: SkillBehaviourField[];
}

/** Checks of skills, remembered per content hash so listing the library stays cheap. */
export interface SkillInspector {
  factsOf(skill: InspectedSkill): SkillFacts;
}

function readDocument(dir: string): string | null {
  for (const marker of SKILL_MARKER_FILES) {
    try {
      return readFileSync(join(dir, marker), "utf8");
    } catch {
      // Try the next marker name.
    }
  }
  return null;
}

/** A linked file or folder is there, and a link inside the skill does not lead out of it. */
function referenceExists(root: string, relativePath: string): boolean {
  const target = join(root, ...relativePath.split("/"));
  if (!lstatOrNull(target)) return false;
  return isInside(canonicalPath(root), canonicalPath(target));
}

/** Every check of one skill folder, reading its files. */
export function inspectSkillFolder(dir: string): SkillIssue[] {
  const { issues, references, referenceLines } = checkSkillDocument(
    readDocument(dir),
    basename(dir),
  );
  const broken = references
    .filter((path) => !referenceExists(dir, path))
    .map((path) => skillIssue("broken_reference", { path }, referenceLines[path]));
  return [...issues, ...broken].sort(
    (a, b) => Number(b.severity === "error") - Number(a.severity === "error"),
  );
}

/** Every check of one skill folder plus the frontmatter flags shown next to it. */
export function inspectSkillFacts(dir: string): SkillFacts {
  const frontmatter = readFrontmatter(dir);
  return {
    issues: inspectSkillFolder(dir),
    manualOnly: frontmatter.manualOnly,
    traits: skillTraits(dir),
    behaviourFields: frontmatter.behaviourFields,
  };
}

export function createSkillInspector(inspect = inspectSkillFacts): SkillInspector {
  const cache = new Map<string, { key: string; facts: SkillFacts }>();
  return {
    factsOf: (skill) => {
      // Without a hash nothing tells us the folder is unchanged, so look again.
      const key = skill.contentHash ? `${skill.libraryPath}\0${skill.contentHash}` : null;
      const cached = cache.get(skill.id);
      if (key && cached?.key === key) return cached.facts;
      let facts: SkillFacts;
      try {
        facts = inspect(skill.libraryPath);
      } catch (error) {
        // One unreadable skill must never stop the whole library from listing.
        const reason = error instanceof Error ? error.message : String(error);
        facts = {
          issues: [skillIssue("frontmatter_invalid", { reason }, 1)],
          manualOnly: false,
          traits: [],
          behaviourFields: [],
        };
      }
      if (key) cache.set(skill.id, { key, facts });
      return facts;
    },
  };
}
