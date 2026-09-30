import { LIBRARY_SKILLS_DIR_NAME, type ProjectTarget } from "@loadout/shared";
import { joinPath } from "@/lib/paths";

/**
 * Where a new skill's folders will be: the first one it is written in, and the other agent
 * folders of a project that get the same skill. Empty until the name is usable.
 */
export interface NewSkillFolders {
  /** The folder the editor opens and an agent writes in; null until it is known. */
  main: string | null;
  /** The same skill in the project's other agent folders. */
  copies: string[];
}

export function newSkillFolders(input: {
  name: string | null;
  /** The project it is created in, or null for the library. */
  project: { path: string } | null;
  targets: readonly Pick<ProjectTarget, "relativeDir">[];
  /** Base folder of the library, once known. */
  libraryPath: string | null;
}): NewSkillFolders {
  const { name, project, targets, libraryPath } = input;
  if (!name) return { main: null, copies: [] };
  if (!project) {
    return {
      main: libraryPath ? joinPath(libraryPath, `${LIBRARY_SKILLS_DIR_NAME}/${name}`) : null,
      copies: [],
    };
  }
  const [first, ...rest] = targets.map((target) =>
    joinPath(project.path, [target.relativeDir, name].filter(Boolean).join("/")),
  );
  return { main: first ?? null, copies: rest };
}
