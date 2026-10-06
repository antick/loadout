import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SOURCE_TYPES,
  type Skill,
  type SourceType,
  cleanAgentKeys,
  cleanSkillNote,
  cleanSuggestPatterns,
  isRecord,
} from "@loadout/shared";
import type { Logger } from "../log";
import { readDirSafe } from "../util/fs";
import { isSafeRelativePath, isSkillFolderName } from "../util/safe-path";

/**
 * The format of the portable metadata files, and how they are read back. Files arrive from other
 * devices, merges and hand edits, so every field is checked on the way in.
 */

export const MACHINE_LOCAL_SOURCES: ReadonlySet<SourceType> = new Set(["local", "import"]);

export interface PortableSkill {
  id: string;
  /** Folder name inside the skills folder. */
  path: string;
  tags: string[];
  source: {
    type: SourceType;
    ref?: string | null;
    url?: string | null;
    subpath?: string | null;
    branch?: string | null;
    revision?: string | null;
    /** Another site a link's download moved to that the user agreed to. */
    trustedHost?: string | null;
  };
  createdAt: number;
  /** Files edited in the app since the skill came from its source. Left out when none. */
  editedFiles?: string[];
  /** The user wrote it, so no source is looked for. Left out when not. */
  authored?: true;
  /** File patterns of projects it is suggested for. Left out when none. */
  suggestFor?: string[];
  /** Keys of agents it must never be deployed to. Left out when none. */
  blockedAgents?: string[];
  /** The user's own note on the skill. Left out when none. */
  note?: string;
  /** When it became a favourite (epoch ms). Left out when it is not one. */
  favoritedAt?: number;
}

export interface PortablePreset {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  /** Skill ids in display order. */
  skills: string[];
  /** Only switches turned off are stored: skill id → agent keys. */
  disabledAgents: Record<string, string[]>;
  createdAt: number;
  updatedAt: number;
}

/** A skill's portable metadata file, as it is written for the backup. */
export function toPortableSkill(skill: Skill): PortableSkill {
  const local = MACHINE_LOCAL_SOURCES.has(skill.sourceType);
  return {
    id: skill.id,
    path: skill.dirName,
    tags: [...skill.tags].sort(),
    source: {
      type: skill.sourceType,
      ref: local ? undefined : skill.sourceRef,
      url: skill.sourceUrl,
      subpath: skill.sourceSubpath,
      branch: skill.sourceBranch,
      revision: skill.sourceRevision,
      trustedHost: skill.sourceTrustedHost ?? undefined,
    },
    createdAt: skill.createdAt,
    editedFiles: skill.editedFiles.length > 0 ? [...skill.editedFiles].sort() : undefined,
    authored: skill.authored ? true : undefined,
    suggestFor: skill.suggestFor.length > 0 ? [...skill.suggestFor].sort() : undefined,
    blockedAgents: skill.blockedAgents.length > 0 ? [...skill.blockedAgents].sort() : undefined,
    note: skill.note ?? undefined,
    favoritedAt: skill.favoritedAt ?? undefined,
  };
}

/** Edited paths from a file that may come from another device; anything unsafe is dropped. */
export function readEditedFiles(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter(isSafeRelativePath))].sort() : [];
}

/** Suggest-for patterns from a file that may come from another device; unusable ones dropped. */
export function readSuggestFor(value: unknown): string[] {
  return Array.isArray(value) ? cleanSuggestPatterns(value).sort() : [];
}

/** Blocked agent keys from a file that may come from another device; bad ones dropped. */
export function readBlockedAgents(value: unknown): string[] {
  return Array.isArray(value) ? cleanAgentKeys(value) : [];
}

/** The note from a file that may come from another device: trimmed and capped, or null. */
export function readNote(value: unknown): string | null {
  return cleanSkillNote(value);
}

/** The favourite time from a file that may come from another device; anything odd is "not one". */
export function readFavoritedAt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

const KNOWN_SOURCE_TYPES: ReadonlySet<unknown> = new Set(SOURCE_TYPES);

function textOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function timeOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * A skill's metadata file as read from disk, where it may come from another device, a merge or a
 * hand edit. Null when its id, folder or source type is unusable; odd optional fields are dropped.
 */
export function readPortableSkill(value: unknown): PortableSkill | null {
  if (!isRecord(value) || typeof value.id !== "string" || !isSkillFolderName(value.path)) {
    return null;
  }
  const source = isRecord(value.source) ? value.source : null;
  if (!source || !KNOWN_SOURCE_TYPES.has(source.type)) return null;
  return {
    ...value,
    id: value.id,
    path: value.path,
    tags: strings(value.tags),
    source: {
      type: source.type as SourceType,
      ref: textOrNull(source.ref),
      url: textOrNull(source.url),
      subpath: textOrNull(source.subpath),
      branch: textOrNull(source.branch),
      revision: textOrNull(source.revision),
      trustedHost: textOrNull(source.trustedHost),
    },
    createdAt: timeOr(value.createdAt, Date.now()),
  };
}

/** A preset's metadata file as read from disk; null when its id or name is unusable. */
export function readPortablePreset(value: unknown): PortablePreset | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return null;
  }
  const disabledAgents: Record<string, string[]> = {};
  if (isRecord(value.disabledAgents)) {
    for (const [skillId, keys] of Object.entries(value.disabledAgents)) {
      disabledAgents[skillId] = strings(keys);
    }
  }
  const createdAt = timeOr(value.createdAt, Date.now());
  return {
    id: value.id,
    name: value.name,
    description: textOrNull(value.description),
    icon: textOrNull(value.icon),
    sortOrder: timeOr(value.sortOrder, 0),
    skills: strings(value.skills),
    disabledAgents,
    createdAt,
    updatedAt: timeOr(value.updatedAt, createdAt),
  };
}

const JSON_SUFFIX = ".json";

/** Every `.json` file in `dir`, parsed; `value` is undefined for one that is not JSON. */
function readJsonFiles(dir: string): { path: string; value: unknown }[] {
  const files: { path: string; value: unknown }[] = [];
  for (const entry of readDirSafe(dir)) {
    if (!entry.isFile() || !entry.name.endsWith(JSON_SUFFIX)) continue;
    const path = join(dir, entry.name);
    let value: unknown;
    try {
      value = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      // Not JSON: callers treat it as unusable.
    }
    files.push({ path, value });
  }
  return files;
}

/** Every metadata file in `dir` that `read` accepts; the rest are skipped and logged. */
export function readJsonDir<T>(dir: string, read: (value: unknown) => T | null, log: Logger): T[] {
  const items: T[] = [];
  for (const { path, value } of readJsonFiles(dir)) {
    const item = value === undefined ? null : read(value);
    // A half-merged or hand-edited file is skipped rather than failing the whole rebuild.
    if (item) items.push(item);
    else log.warn(`Skipped unreadable metadata file: ${path}`);
  }
  return items;
}

/** A skill metadata file as it is on disk, with its fields as yet unchecked. */
export interface PortableSkillFile {
  path: string;
  file: Record<string, unknown>;
}

/**
 * The skill metadata files of `dir` as they are, for callers that judge single fields (a folder
 * outside the library, a revision to carry over). Files that are not JSON objects are left out,
 * as the rebuild leaves them.
 */
export function readPortableSkillFiles(dir: string): PortableSkillFile[] {
  return readJsonFiles(dir).flatMap(({ path, value }) =>
    isRecord(value) ? [{ path, file: value }] : [],
  );
}
