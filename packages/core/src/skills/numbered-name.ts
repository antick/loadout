import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type HashOptions, hashDir } from "../util/hash";
import { toPosix } from "../util/fs";
import { readSkillDocument, readSkillIdentity, setFrontmatterName } from "./metadata";

/** `pdf-2`: a folder name the library gave a second, different skill called `pdf`. */
const NUMBERED = /^(.+)-(\d+)$/;

interface NameFix {
  /** The skill document, relative to the skill folder, `/` separated. */
  filename: string;
  content: string;
  name: string;
}

/**
 * A skill that went into the library as `<its name>-N`, because another skill had its name,
 * says `name: <its name>` in its SKILL.md: agents would see two skills with one name, and the
 * Agent Skills rules want the name to match the folder. This is the document with that fixed,
 * or null when `sourceDir` needs nothing for `dirName`.
 */
function nameFix(sourceDir: string, dirName: string): NameFix | null {
  const numbered = NUMBERED.exec(dirName);
  if (!numbered || readSkillIdentity(sourceDir).name !== numbered[1]) return null;
  const found = readSkillDocument(sourceDir);
  if (!found) return null;
  const content = setFrontmatterName(found.content, dirName);
  if (content === found.content) return null;
  return { filename: toPosix(found.filename), content, name: dirName };
}

/** Hash of `sourceDir` as the library keeps it under `dirName`: its name fixed if needed. */
export function hashAsLibraryCopy(
  sourceDir: string,
  dirName: string,
  options: HashOptions = {},
): string | null {
  const fix = nameFix(sourceDir, dirName);
  if (!fix) return hashDir(sourceDir, options);
  return hashDir(sourceDir, { ...options, overrides: new Map([[fix.filename, fix.content]]) });
}

/**
 * Fix the name in a library folder just written as `<its name>-N`. Returns the name it now
 * carries, or null when nothing needed changing.
 */
export function fixNumberedName(libraryDir: string, dirName: string): string | null {
  const fix = nameFix(libraryDir, dirName);
  if (!fix) return null;
  writeFileSync(join(libraryDir, fix.filename), fix.content);
  return fix.name;
}
