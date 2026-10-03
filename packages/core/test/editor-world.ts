import type { SkillLocation } from "@loadout/shared";
import { type EditorService, createEditorService, createFileHistory } from "../src/editor";
import { createInstructionFinder } from "../src/instructions";
import { ProjectStore } from "../src/projects/store";
import { type SkillsService, createSkillsService } from "../src/skills/service";
import { createRemovedStore } from "../src/storage";
import { type UpdatesWorld, createUpdatesWorld } from "./updates-world";

export interface EditorWorld {
  world: UpdatesWorld;
  skills: SkillsService;
  editor: EditorService;
  projects: ProjectStore;
}

/** The updates world with skills and the editor wired as `createCore` wires them. */
export function createEditorWorld(): EditorWorld {
  const world = createUpdatesWorld();
  const history = createFileHistory(world.ctx.paths.historyDir);
  const skills = createSkillsService(world.ctx, {
    store: world.store,
    removeDeployments: world.deploy.removeAllForSkill,
    history,
    install: world.install.installIntoLibrary,
    rename: { deploy: world.deploy, projectSkillFolders: () => [] },
    removed: createRemovedStore(world.ctx, { store: world.store }),
  });
  const projects = new ProjectStore(world.ctx.db);
  const editor = createEditorService(world.ctx, {
    store: world.store,
    registry: world.registry,
    projects,
    instructions: createInstructionFinder({ registry: world.registry, projects }),
    history,
    refreshCopies: async (skill) => {
      const report = await world.deploy.refreshCopies(skill, { keepModified: true });
      return { written: report.written, kept: report.kept };
    },
  });
  return { world, skills, editor, projects };
}

export const libraryLocation = (skillId: string): SkillLocation => ({ kind: "library", skillId });

/** The AppError a call was refused with. */
export { rejection } from "./helpers";
