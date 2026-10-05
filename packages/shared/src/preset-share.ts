import type { BatchFailure, Preset } from "./types";

/**
 * A preset as one file to share (`<name>.loadout-preset.json`): its skills by name, where each
 * came from, and, for skills without a source, their files. Importing it installs what the
 * library lacks and creates the preset.
 */

export const PRESET_FILE_FORMAT = "loadout-preset";
export const PRESET_FILE_VERSION = 1;
export const PRESET_FILE_EXTENSION = ".loadout-preset.json";
/** What open and save dialogs filter on: the last part of the extension. */
export const PRESET_FILE_DIALOG_EXTENSIONS = ["json"];
/** A file name from a preset's name: `Web kit` → `web-kit.loadout-preset.json`. */
export function presetFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "preset"}${PRESET_FILE_EXTENSION}`;
}

/** Files of skills without a source are embedded up to this size in total. */
export const PRESET_FILE_MAX_EMBED_BYTES = 8 * 1024 * 1024;
/** A preset file larger than this is refused on import. */
export const PRESET_FILE_MAX_BYTES = 16 * 1024 * 1024;

/** One file of an embedded skill: text as is, anything else in base64. */
export interface PresetFileEntry {
  text?: string;
  base64?: string;
  executable?: true;
}

export interface PresetFileSkill {
  name: string;
  description?: string | null;
  /** Where to install it from: a Git repository or an archive link, and the folder in it. */
  source?: { url: string; branch?: string | null; subpath?: string | null };
  /** The skill's files, `/` separated paths, for skills without a source. */
  files?: Record<string, PresetFileEntry>;
  /** Agent keys the preset switches this skill off for. */
  offFor?: string[];
}

export interface PresetFile {
  format: typeof PRESET_FILE_FORMAT;
  version: number;
  name: string;
  description: string | null;
  icon: string | null;
  skills: PresetFileSkill[];
}

export interface PresetExportOptions {
  /** Embed the files of skills that have no source to install from (default true). */
  includeFiles?: boolean;
}

export interface PresetExportResult {
  path: string;
  skills: number;
  /** Skills written with their files. */
  embedded: number;
  /** Skills written by name only: no source and files were not included. */
  nameOnly: string[];
}

/**
 * What importing does with each skill: `library` uses the library's skill (the same source; for a
 * skill without one, the same name and files; for a skill the file only names, the same name);
 * `source` installs it from its repository or link; `files` from the file itself; `missing`
 * cannot be had.
 */
export type PresetImportSkillState = "library" | "source" | "files" | "missing";

export interface PresetImportSkill {
  name: string;
  description: string | null;
  state: PresetImportSkillState;
  /** The library skill used, for `library`. */
  librarySkillId: string | null;
  /** Where it comes from, safe to show, for `source`. */
  from: string | null;
  /**
   * A library skill of this name that is a different skill (another source, branch or none,
   * other files). It is left alone and this one is installed beside it under a free name, unless
   * `reuseSameName` names it: then it is used (`library`) in place of the file's skill.
   */
  sameNameSkillId: string | null;
}

export interface PresetImportPlan {
  name: string;
  description: string | null;
  icon: string | null;
  /** A preset of that name exists; the import gets a numbered name unless another is given. */
  nameTaken: boolean;
  skills: PresetImportSkill[];
}

export interface PresetPreviewOptions {
  /**
   * Names of the file's skills to take from the library after all, though the library's skill of
   * that name is a different one (`sameNameSkillId`). The person chose it; it is never assumed.
   */
  reuseSameName?: string[];
}

export interface PresetImportOptions extends PresetPreviewOptions {
  /** Name of the new preset; the file's name when left out. */
  name?: string;
  /** The user read the safety report of a flagged skill and installs it anyway. */
  acceptRisk?: boolean;
}

export interface PresetImportResult {
  preset: Preset;
  /** Names of skills installed into the library. */
  installed: string[];
  /** Names of library skills the preset uses as they were. */
  reused: string[];
  failed: BatchFailure[];
}
