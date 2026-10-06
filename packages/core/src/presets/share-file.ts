import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PRESET_FILE_FORMAT,
  PRESET_FILE_MAX_EMBED_BYTES,
  PRESET_FILE_VERSION,
  type Preset,
  type PresetFile,
  type PresetFileEntry,
  type PresetFileSkill,
  type Skill,
  formatBytes,
} from "@loadout/shared";
import { invalid } from "../errors";
import { isSafeRelativePath } from "../util/safe-path";
import { writeFileAtomic, EXECUTABLE_MODE } from "../util/fs";
import { fileDigests, listContentFiles, sha256Hex } from "../util/hash";

/** Most skills a preset file may list, and longest names it may carry. */
const MAX_SKILLS = 500;
const MAX_NAME_LENGTH = 200;
const REPLACEMENT_CHAR = "�";

/** Where a skill can be installed from on another computer; null when only here. */
export function remoteSourceOf(skill: Skill): NonNullable<PresetFileSkill["source"]> | null {
  if ((skill.sourceType === "git" || skill.sourceType === "marketplace") && skill.sourceUrl) {
    return {
      url: skill.sourceUrl,
      branch: skill.sourceType === "git" ? skill.sourceBranch : null,
      subpath: skill.sourceSubpath,
    };
  }
  if (skill.sourceType === "url" && skill.sourceRef) {
    return { url: skill.sourceRef, branch: null, subpath: skill.sourceSubpath };
  }
  return null;
}

/** A skill's files as file entries: text kept readable, anything else in base64. */
function embedFiles(skill: Skill, budget: { left: number }): Record<string, PresetFileEntry> {
  const files: Record<string, PresetFileEntry> = {};
  for (const file of listContentFiles(skill.libraryPath)) {
    budget.left -= file.size;
    if (budget.left < 0) {
      throw invalid(
        `The skills' files come to more than ${formatBytes(PRESET_FILE_MAX_EMBED_BYTES)}. Export without them, or share those skills as a .zip.`,
      );
    }
    const data = readFileSync(file.absolutePath);
    const text = data.toString("utf8");
    const isText = !text.includes(REPLACEMENT_CHAR) && !data.includes(0);
    files[file.relativePath] = {
      ...(isText ? { text } : { base64: data.toString("base64") }),
      ...(file.executable ? { executable: true as const } : {}),
    };
  }
  return files;
}

/** The preset as a file: each skill with its source, or its files, or only its name. */
export function buildPresetFile(
  preset: Preset,
  skills: readonly Skill[],
  offFor: (skillId: string) => string[],
  includeFiles: boolean,
): { file: PresetFile; embedded: number; nameOnly: string[] } {
  const budget = { left: PRESET_FILE_MAX_EMBED_BYTES };
  let embedded = 0;
  const nameOnly: string[] = [];
  const entries = skills.map((skill): PresetFileSkill => {
    const off = offFor(skill.id);
    const base: PresetFileSkill = {
      name: skill.name,
      description: skill.description,
      ...(off.length > 0 ? { offFor: off } : {}),
    };
    const source = remoteSourceOf(skill);
    if (source) return { ...base, source };
    if (!includeFiles) {
      nameOnly.push(skill.name);
      return base;
    }
    embedded += 1;
    return { ...base, files: embedFiles(skill, budget) };
  });
  return {
    file: {
      format: PRESET_FILE_FORMAT,
      version: PRESET_FILE_VERSION,
      name: preset.name,
      description: preset.description,
      icon: preset.icon,
      skills: entries,
    },
    embedded,
    nameOnly,
  };
}

const isString = (value: unknown): value is string => typeof value === "string";
const shortString = (value: unknown): value is string =>
  isString(value) && value.trim().length > 0 && value.length <= MAX_NAME_LENGTH;

function readEntry(value: unknown): PresetFileEntry | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  const executable = entry.executable === true ? { executable: true as const } : {};
  if (isString(entry.text)) return { text: entry.text, ...executable };
  if (isString(entry.base64)) return { base64: entry.base64, ...executable };
  return null;
}

function readSkill(value: unknown): PresetFileSkill | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!shortString(raw.name)) return null;
  const skill: PresetFileSkill = {
    name: raw.name.trim(),
    description: isString(raw.description) ? raw.description : null,
  };
  if (Array.isArray(raw.offFor)) skill.offFor = raw.offFor.filter(shortString);
  const source = raw.source as Record<string, unknown> | undefined;
  if (
    source &&
    typeof source === "object" &&
    isString(source.url) &&
    /^[a-z]+:\/\/|^git@/i.test(source.url)
  ) {
    const subpath = isSafeRelativePath(source.subpath) ? source.subpath : null;
    skill.source = {
      url: source.url,
      branch: shortString(source.branch) ? source.branch : null,
      subpath,
    };
  } else if (raw.files && typeof raw.files === "object") {
    const files: Record<string, PresetFileEntry> = {};
    for (const [path, entry] of Object.entries(raw.files as Record<string, unknown>)) {
      const read = readEntry(entry);
      // A path that could leave the skill's folder makes the whole skill unusable.
      if (!isSafeRelativePath(path) || !read) return { ...skill, files: undefined };
      files[path] = read;
    }
    if (Object.keys(files).length > 0) skill.files = files;
  }
  return skill;
}

/** Read a preset file someone else wrote. Anything unsafe or unknown is refused or dropped. */
export function parsePresetFile(text: string): PresetFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw invalid("This is not a preset file: it is not JSON.");
  }
  const file = raw as Record<string, unknown> | null;
  if (!file || file.format !== PRESET_FILE_FORMAT) {
    throw invalid("This is not a Loadout preset file.");
  }
  if (typeof file.version !== "number" || file.version > PRESET_FILE_VERSION) {
    throw invalid("This preset file was written by a newer Loadout. Update the app to import it.");
  }
  if (!shortString(file.name)) throw invalid("The preset file has no name.");
  const skills = Array.isArray(file.skills) ? file.skills.slice(0, MAX_SKILLS) : [];
  return {
    format: PRESET_FILE_FORMAT,
    version: file.version,
    name: file.name.trim(),
    description: isString(file.description) ? file.description : null,
    icon: shortString(file.icon) ? file.icon : null,
    skills: skills.flatMap((entry) => readSkill(entry) ?? []),
  };
}

const entryContent = (entry: PresetFileEntry): string | Buffer =>
  entry.text ?? Buffer.from(entry.base64 ?? "", "base64");

/** Write an embedded skill's files into `dir`. */
export function writeEmbeddedSkill(dir: string, files: Record<string, PresetFileEntry>): void {
  for (const [path, entry] of Object.entries(files)) {
    writeFileAtomic(
      join(dir, ...path.split("/")),
      entryContent(entry),
      entry.executable ? EXECUTABLE_MODE : undefined,
    );
  }
}

/** True when the library skill holds exactly these files, path for path and byte for byte. */
export function holdsEmbeddedFiles(skill: Skill, files: Record<string, PresetFileEntry>): boolean {
  const held = fileDigests(skill.libraryPath);
  const paths = Object.keys(files);
  return (
    paths.length === Object.keys(held).length &&
    paths.every((path) => {
      const entry = files[path];
      return entry !== undefined && held[path] === sha256Hex(entryContent(entry));
    })
  );
}
