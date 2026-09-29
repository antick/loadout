import { type SkillTrait, mergeTraits, scriptsTrait } from "@loadout/shared";
import { listContentFiles } from "../util/hash";
import { readFrontmatter } from "./metadata";

/** The `scripts` trait of a skill folder: files it ships that can run. Reads names, not contents. */
export function folderTraits(dir: string): SkillTrait[] {
  const trait = scriptsTrait(
    listContentFiles(dir).map((file) => ({ path: file.relativePath, executable: file.executable })),
  );
  return trait ? [trait] : [];
}

/** Everything a skill folder can make an agent do beyond reading it. */
export function skillTraits(dir: string): SkillTrait[] {
  return mergeTraits(readFrontmatter(dir).traits, folderTraits(dir));
}
