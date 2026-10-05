import { join } from "node:path";
import { APP_NAME } from "@loadout/shared";
import type { AgentRegistry } from "../agents/registry";
import type { CoreContext } from "../context";
import { invalid } from "../errors";
import { pathsOverlap, realPathOf } from "../util/fs";
import { projectSkillDirs } from "./targets";

/** A folder no workspace or project skills folder may be, lie inside, or hold. */
export interface GuardedFolder {
  /** Its real path. */
  path: string;
  /** What it is, for people. */
  what: string;
}

/**
 * Folders the app already manages: the library's whole folder, and every agent's own skills
 * folder. One folder reached two ways would be two places to the app, and its copies and
 * removals would reach into the other.
 */
export function guardedFolders(libraryDir: string, registry: AgentRegistry): GuardedFolder[] {
  return [
    { path: realPathOf(libraryDir), what: `the ${APP_NAME} library` },
    ...registry.list().map((agent) => ({
      path: realPathOf(agent.skillsDir),
      what: `the skills folder of ${agent.displayName}`,
    })),
  ];
}

/**
 * The guarded folder `path` is, lies inside or holds; null when it is clear of them all. Links
 * are followed in whatever part of `path` exists, so a folder not made yet is judged by where it
 * would really be.
 */
export function overlappingFolder(
  guarded: readonly GuardedFolder[],
  path: string,
): GuardedFolder | null {
  const real = realPathOf(path);
  return guarded.find((folder) => pathsOverlap(real, folder.path)) ?? null;
}

function refuseOverlap(guarded: readonly GuardedFolder[], path: string, label: string): void {
  const hit = overlappingFolder(guarded, path);
  if (hit) {
    throw invalid(
      `${label} ${path} overlaps ${hit.what} (${hit.path}). ${APP_NAME} manages that folder already: pick another.`,
    );
  }
}

/** A linked workspace's folders must stay clear of the library and of agents' own folders. */
export function refuseLinkedOverlap(
  ctx: CoreContext,
  registry: AgentRegistry,
  root: string,
  disabledRoot: string | null,
): void {
  const guarded = guardedFolders(ctx.paths.baseDir, registry);
  refuseOverlap(guarded, root, "The skills folder");
  if (disabledRoot) refuseOverlap(guarded, disabledRoot, "The disabled skills folder");
}

/**
 * A project must not hold the library, nor be the place an agent's own folder lives (the home
 * folder as a project would make `~/.claude/skills` a project folder).
 */
export function refuseProjectOverlap(
  ctx: CoreContext,
  registry: AgentRegistry,
  root: string,
): void {
  const [library, ...agents] = guardedFolders(ctx.paths.baseDir, registry);
  if (library) refuseOverlap([library], root, "The project");
  for (const dir of projectSkillDirs(registry)) {
    refuseOverlap(agents, join(root, dir), "Its skills folder");
  }
}
