import { type SkillTrait, mergeTraits, scriptsTrait } from "@loadout/shared";
import { listContentFiles } from "../util/hash";
import { readFrontmatter } from "./metadata";

/** The `scripts` trait of a skill folder holding these files (paths relative to it). */
export function filesTraits(files: readonly { path: string; executable: boolean }[]): SkillTrait[] {
  const trait = scriptsTrait(files);
  return trait ? [trait] : [];
}

/** The `scripts` trait of a skill folder: files it ships that can run. Reads names, not contents. */
export function folderTraits(dir: string): SkillTrait[] {
  return filesTraits(
    listContentFiles(dir).map((file) => ({ path: file.relativePath, executable: file.executable })),
  );
}

/** Everything a skill folder can make an agent do beyond reading it. */
export function skillTraits(dir: string): SkillTrait[] {
  return mergeTraits(readFrontmatter(dir).traits, folderTraits(dir));
}
