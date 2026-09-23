import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  SKILL_MARKER_FILES,
  type SkillIssue,
  checkSkillDocument,
  skillIssue,
} from "@loadout/shared";
import { canonicalPath, isInside, lstatOrNull } from "../util/fs";

/** What the checks need to know about a library skill. */
export interface InspectedSkill {
  id: string;
  libraryPath: string;
  contentHash: string | null;
}

/** Checks of skills, remembered per content hash so listing the library stays cheap. */
export interface SkillInspector {
  issuesOf(skill: InspectedSkill): SkillIssue[];
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

export function createSkillInspector(inspect = inspectSkillFolder): SkillInspector {
  const cache = new Map<string, { key: string; issues: SkillIssue[] }>();
  return {
    issuesOf: (skill) => {
      // Without a hash nothing tells us the folder is unchanged, so look again.
      const key = skill.contentHash ? `${skill.libraryPath}\0${skill.contentHash}` : null;
      const cached = cache.get(skill.id);
      if (key && cached?.key === key) return cached.issues;
      const issues = inspect(skill.libraryPath);
      if (key) cache.set(skill.id, { key, issues });
      return issues;
    },
  };
}
