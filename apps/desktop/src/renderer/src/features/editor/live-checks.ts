import {
  SKILL_MARKER_FILES,
  type SkillFileEntry,
  type SkillIssue,
  checkSkillDocument,
  skillIssue,
} from "@loadout/shared";

/** The file the Agent Skills checks apply to: `SKILL.md` at the top of the skill folder. */
export function isSkillDocument(path: string): boolean {
  return SKILL_MARKER_FILES.some((marker) => marker === path);
}

/**
 * The same checks the library runs, on text that is not saved yet. Links are tested against the
 * skill's file list: a link to a folder counts when any file sits inside it.
 */
export function checkDraft(
  content: string,
  folderName: string,
  files: readonly Pick<SkillFileEntry, "path">[],
): SkillIssue[] {
  const { issues, references, referenceLines } = checkSkillDocument(content, folderName);
  const paths = files.map((file) => file.path);
  const exists = (reference: string): boolean =>
    paths.some((path) => path === reference || path.startsWith(`${reference}/`));
  const broken = references
    .filter((reference) => !exists(reference))
    .map((path) => skillIssue("broken_reference", { path }, referenceLines[path]));
  return [...issues, ...broken].sort(
    (a, b) => Number(b.severity === "error") - Number(a.severity === "error"),
  );
}
