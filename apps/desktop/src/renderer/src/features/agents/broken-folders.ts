import type { BrokenSkillFolder } from "@loadout/shared";

/** Rows shown before "Show all": a folder full of leftovers must not push the skills off screen. */
export const BROKEN_FOLDERS_SHOWN = 4;

export type BrokenFolderProblem =
  | { key: "agents.broken.reason.danglingLink"; target: string }
  | { key: "agents.broken.reason.empty" }
  | { key: "agents.broken.reason.noDocument"; count: number };

/** What is wrong with one folder, as a translation key and its values. */
export function brokenFolderProblem(folder: BrokenSkillFolder): BrokenFolderProblem {
  if (folder.reason === "dangling_link") {
    return { key: "agents.broken.reason.danglingLink", target: folder.linkTarget ?? "" };
  }
  if (folder.files.length === 0) return { key: "agents.broken.reason.empty" };
  return { key: "agents.broken.reason.noDocument", count: folder.files.length };
}
