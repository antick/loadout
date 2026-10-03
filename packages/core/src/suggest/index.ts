import type { LocalSkill, ProjectSuggestions, Skill } from "@loadout/shared";
import type { CoreContext } from "../context";
import { INTERNAL_KEYS } from "../settings/store";
import { isDirectory } from "../util/fs";
import { matchSkills } from "./match";
import { readProjectFiles } from "./project-files";

export { firstMatch } from "./glob";

/** Skills the user said are not for the project. */
function dismissedSuggestions(ctx: CoreContext, projectId: string): string[] {
  return ctx.settings.getRaw<string[]>(INTERNAL_KEYS.projectSuggestionsDismissed(projectId), []);
}

export function setSuggestionDismissed(
  ctx: CoreContext,
  projectId: string,
  skillId: string,
  dismissed: boolean,
): void {
  const current = new Set(dismissedSuggestions(ctx, projectId));
  if (dismissed) current.add(skillId);
  else current.delete(skillId);
  ctx.settings.setRaw(INTERNAL_KEYS.projectSuggestionsDismissed(projectId), [...current]);
}

/**
 * Library skills worth adding to the project at `path`. Skills already in it (linked, or a folder
 * of the same name that adding would clash with) and dismissed ones are left out.
 */
export function suggestForProject(
  ctx: CoreContext,
  input: {
    projectId: string;
    path: string;
    library: readonly Skill[];
    present: readonly LocalSkill[];
  },
): ProjectSuggestions {
  const dismissed = dismissedSuggestions(ctx, input.projectId);
  if (!isDirectory(input.path)) return { technologies: [], suggestions: [], dismissed };
  const presentNames = new Set(input.present.map((skill) => skill.dirName.toLowerCase()));
  const exclude = new Set([
    ...dismissed,
    ...input.present.flatMap((skill) => skill.librarySkillId ?? []),
    ...input.library
      .filter((skill) => presentNames.has(skill.dirName.toLowerCase()))
      .map((skill) => skill.id),
  ]);
  const found = matchSkills(input.library, readProjectFiles(input.path), exclude);
  // A dismissed skill that was deleted since is no longer worth listing.
  const known = new Set(input.library.map((skill) => skill.id));
  return { ...found, dismissed: dismissed.filter((id) => known.has(id)) };
}
