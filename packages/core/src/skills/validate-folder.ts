import { basename, relative } from "node:path";
import type { SkillIssue } from "@loadout/shared";
import { notFound } from "../errors";
import { findSkillDirs, isAgentSpecificPath } from "../install/repo-scan";
import { isDirectory, toPosix } from "../util/fs";
import { inspectSkillFolder } from "./checks";
import { readSkillIdentity } from "./metadata";

/** One skill folder found under the checked folder, with its format problems. */
export interface CheckedFolderSkill {
  /** Relative to the checked folder, `/` separated; the folder's own name when it is the root. */
  path: string;
  name: string;
  issues: SkillIssue[];
}

/** Two or more skills with one name where an agent would load them side by side. */
export interface DuplicateSkillName {
  name: string;
  paths: string[];
}

export interface FolderCheck {
  skills: CheckedFolderSkill[];
  duplicates: DuplicateSkillName[];
}

/**
 * The part of a path that one agent reads, such as `.claude/skills` for `.claude/skills/pdf`, or
 * "" for an agent-neutral skill. Repositories ship one skill per agent on purpose, so the same
 * name in `pdf/` and `.claude/skills/pdf/` is not a clash; the same name twice in one area is.
 */
function areaOf(path: string): string {
  if (!isAgentSpecificPath(path)) return "";
  const segments = path.split("/");
  return segments.slice(0, -1).join("/");
}

function findDuplicates(skills: readonly CheckedFolderSkill[]): DuplicateSkillName[] {
  const groups = new Map<string, CheckedFolderSkill[]>();
  for (const skill of skills) {
    const key = `${areaOf(skill.path)}\0${skill.name.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), skill]);
  }
  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({ name: group[0]?.name ?? "", paths: group.map((skill) => skill.path) }));
}

/**
 * Check every skill folder under `root` against the Agent Skills format, and look for names used
 * twice. Reads only; no library needed, so it runs in a repository's CI.
 */
export function checkSkillFolder(root: string): FolderCheck {
  if (!isDirectory(root)) throw notFound(`No folder at ${root}`);
  const skills = findSkillDirs(root).map((dir) => ({
    path: toPosix(relative(root, dir)) || basename(root),
    name: readSkillIdentity(dir).name,
    issues: inspectSkillFolder(dir),
  }));
  return { skills, duplicates: findDuplicates(skills) };
}
