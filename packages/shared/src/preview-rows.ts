/**
 * The skills of an import preview as a list to choose from: grouped by folder, filtered, and
 * which start ticked. Shared by the app's import dialog and the command line's picker.
 */

import type { InstallOutcome } from "./install-plan";
import type { GitPreview, RepoSkillPreview } from "./types-install";

/** Skills under one folder of the source, e.g. every skill in `skills/`. */
export interface PreviewGroup {
  /** Parent folder of the skills, `/` separated; empty for skills at the top. */
  folder: string;
  rows: RepoSkillPreview[];
}

/** A source this big gets a search field in the import list. */
export const PREVIEW_SEARCH_MIN_SKILLS = 8;
/** Folder groups start collapsed above this many skills, so the list opens short. */
export const PREVIEW_COLLAPSE_MIN_SKILLS = 30;

/** Parent folder of a preview row's path; empty for a skill at the top of the source. */
export function folderOf(relPath: string): string {
  const cut = relPath.lastIndexOf("/");
  return cut === -1 ? "" : relPath.slice(0, cut);
}

/** Rows by parent folder, in the order the folders first appear (the source lists by path). */
export function groupPreviewRows(rows: readonly RepoSkillPreview[]): PreviewGroup[] {
  const groups = new Map<string, RepoSkillPreview[]>();
  for (const row of rows) {
    const folder = folderOf(row.relPath);
    groups.set(folder, [...(groups.get(folder) ?? []), row]);
  }
  return [...groups].map(([folder, grouped]) => ({ folder, rows: grouped }));
}

/** Groups are worth showing only when the skills sit in more than one folder. */
export function showsGroups(groups: readonly PreviewGroup[]): boolean {
  return groups.length > 1;
}

/** Rows with `query` in the name, folder or description, ignoring case, like the library search. */
export function filterPreviewRows(
  rows: readonly RepoSkillPreview[],
  query: string,
): RepoSkillPreview[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...rows];
  return rows.filter((row) =>
    [row.name, row.relPath, row.description].some((field) => field?.toLowerCase().includes(needle)),
  );
}

/**
 * Ticked when the list opens: what the typed text named, else every skill whose name is free.
 * A name already in use needs a decision, so it starts unticked unless it is all there is.
 */
export function initialSelection(
  preview: Pick<GitPreview, "skills" | "selected">,
  outcomes: readonly InstallOutcome[],
): Set<string> {
  if (preview.selected) return new Set(preview.selected);
  const free = preview.skills.filter((_, index) => outcomes[index]?.kind === "new");
  const chosen = free.length > 0 ? free : preview.skills;
  return new Set(chosen.map((row) => row.relPath));
}

/** How many of `rows` are ticked: none, some or all of them. */
export function groupState(
  rows: readonly RepoSkillPreview[],
  checked: ReadonlySet<string>,
): boolean | "indeterminate" {
  const ticked = rows.filter((row) => checked.has(row.relPath)).length;
  if (ticked === 0) return false;
  return ticked === rows.length ? true : "indeterminate";
}
