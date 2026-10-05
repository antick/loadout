/** Editor types. Split from `types.ts` to keep both files small. */

import type { Skill } from "./types";

export type SkillFileLock = "binary" | "too_large";

/** One file inside a library skill's folder. */
export interface SkillFileEntry {
  /** Relative to the skill folder, `/` separated. */
  path: string;
  size: number;
  /** Why the file cannot be opened in the editor; null when it can. */
  locked: SkillFileLock | null;
  /** The skill's main document (usually `SKILL.md`). */
  main: boolean;
  /** Changed in the app since the skill last came from its source. */
  edited: boolean;
}

export type LineEnding = "lf" | "crlf";

/** A text file opened for editing. `content` always uses `\n`; saving restores `eol`. */
export interface SkillFile {
  path: string;
  content: string;
  /** Hash of the bytes on disk. Send it back when saving so a change made meanwhile is noticed. */
  hash: string;
  eol: LineEnding;
  modifiedAt: number;
  /**
   * Not on disk yet (an instruction file nobody wrote): it reads as empty with `NEW_FILE_HASH`,
   * and the first save creates it. A file that appeared meanwhile is a change on disk.
   */
  isNew?: boolean;
}

/**
 * What the editor opens: a skill in the library, an agent's global folder or a project, or an
 * agent's instruction file.
 */
export type SkillLocation =
  | { kind: "library"; skillId: string }
  | { kind: "agent"; agentKey: string; relativePath: string }
  | { kind: "project"; projectId: string; relativePath: string; agentKey: string }
  /** An agent's instruction file: global when `projectId` is null, else in that project. */
  | { kind: "instructions"; agentKey: string; projectId: string | null };

/** Another copy of the same skill in the same project, in another agent's folder. */
export interface SkillCopy {
  agentKey: string;
  agentName: string;
}

/** What the editor needs to know about the skill it opens. */
export interface EditTarget {
  /**
   * Where edits go. A copy that is a link into the library comes back as the library skill, so
   * editing it keeps the library's bookkeeping.
   */
  location: SkillLocation;
  name: string;
  /** Folder name, which the format checks compare the skill name with. */
  folderName: string;
  path: string;
  /** "Library", an agent's name, or "<project> · <agent>". */
  placeLabel: string;
  /** The library skill this copy matches, if any. */
  librarySkillId: string | null;
  /** Other copies of this skill in the same project (project copies only). */
  otherCopies: SkillCopy[];
}

/** What a save does to the project's other copies of the skill. */
export type OtherCopiesMode = "identical" | "none";

export interface SaveSkillFileInput {
  path: string;
  content: string;
  /** `SkillFile.hash` of the version the edit started from. */
  baseHash: string;
  /** Write even though the file changed on disk after `baseHash` was read. */
  overwrite?: boolean;
  /**
   * Project copies: `identical` also writes the change to every other copy whose file was the
   * same as this one before the edit. Default `none`.
   */
  otherCopies?: OtherCopiesMode;
}

export interface SaveSkillFileResult {
  /** The library skill after the save; null when a copy outside the library was edited. */
  skill: Skill | null;
  file: SkillFile;
  /** False when the content was already on disk, so nothing was written. */
  written: boolean;
  /** Copy deployments rewritten with the new content (library skills). */
  copiesRefreshed: number;
  /** Agents whose copied folder has its own changes; those copies were left alone. */
  copiesKept: string[];
  /** Project copies that got the same change. */
  otherCopiesSaved: string[];
  /** Project copies left alone because their file differed, or was missing, before the edit. */
  otherCopiesSkipped: string[];
}

/** An earlier version of a file, kept on this computer each time the editor overwrites it. */
export interface SkillFileVersion {
  id: string;
  savedAt: number;
  size: number;
}

/** What creating, renaming or deleting a file or folder of a library skill did. */
export interface SkillFileChangeResult {
  /** The library skill after the change. */
  skill: Skill;
  /** The file or folder created, renamed to, or deleted. `/` separated. */
  path: string;
  /** Copy deployments rewritten with the new content. */
  copiesRefreshed: number;
  /** Agents whose copied folder has its own changes; those copies were left alone. */
  copiesKept: string[];
}
