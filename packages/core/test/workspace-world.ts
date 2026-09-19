import { lstatSync, readFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { expect } from "vitest";
import { AppError } from "../src/errors";
import { installIntoLibrary } from "../src/install/library";
import { type PresetsService, createPresetsService } from "../src/presets";
import { type ProjectsService, createProjectsService } from "../src/projects";
import { listContentFiles } from "../src/util/hash";
import { type WorkspaceService, createWorkspaceService } from "../src/workspace";
import { type DeployWorld, createDeployWorld } from "./deploy-world";

export interface WorkspaceWorld extends DeployWorld {
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
  return {
    ...world,
    presets: createPresetsService(ctx, { store, registry, deploy }),
    workspace: createWorkspaceService(ctx, { store, registry, deploy, install }),
    projects: createProjectsService(ctx, { store, registry, deploy, install }),
  };
}

/** Give every content file of a skill folder the same modification time (epoch ms). */
export function setContentMtime(skillDir: string, mtimeMs: number): void {
  const when = new Date(mtimeMs);
  for (const file of listContentFiles(skillDir)) utimesSync(file.absolutePath, when, when);
}

/** The `AppError` a call is expected to fail with. */
export async function rejection(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

export const isLink = (path: string): boolean => lstatSync(path).isSymbolicLink();
export const skillText = (dir: string): string => readFileSync(join(dir, "SKILL.md"), "utf8");
