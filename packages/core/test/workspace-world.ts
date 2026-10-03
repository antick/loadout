import { lstatSync, readFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { installIntoLibrary } from "../src/install/library";
import { type PresetsService, createPresetsService } from "../src/presets";
import { type ProjectsService, createProjectsService } from "../src/projects";
import { type RemovedStore, createRemovedStore } from "../src/storage";
import { listContentFiles } from "../src/util/hash";
import { type WorkspaceService, createWorkspaceService } from "../src/workspace";
import { type DeployWorld, createDeployWorld } from "./deploy-world";

export interface WorkspaceWorld extends DeployWorld {
  removed: RemovedStore;
  presets: PresetsService;
  workspace: WorkspaceService;
  projects: ProjectsService;
}

/** The deploy world plus presets, the global workspace and projects, wired as `createCore` does. */
export function createWorkspaceWorld(): WorkspaceWorld {
  const world = createDeployWorld();
  const { ctx, store, registry, deploy } = world;
  const install = {
    installIntoLibrary: (request: Parameters<typeof installIntoLibrary>[2]) =>
      installIntoLibrary(ctx, store, request),
  };
  const removed = createRemovedStore(ctx, { store });
  return {
    ...world,
    removed,
    presets: createPresetsService(ctx, { store, registry, deploy }),
    workspace: createWorkspaceService(ctx, { store, registry, deploy, install, removed }),
    projects: createProjectsService(ctx, { store, registry, deploy, install, removed }),
  };
}

/** Give every content file of a skill folder the same modification time (epoch ms). */
export function setContentMtime(skillDir: string, mtimeMs: number): void {
  const when = new Date(mtimeMs);
  for (const file of listContentFiles(skillDir)) utimesSync(file.absolutePath, when, when);
}

/** The `AppError` a call is expected to fail with. */
export { rejection } from "./helpers";

export const isLink = (path: string): boolean => lstatSync(path).isSymbolicLink();
export const skillText = (dir: string): string => readFileSync(join(dir, "SKILL.md"), "utf8");
