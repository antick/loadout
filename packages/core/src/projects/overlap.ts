import { join } from "node:path";
import { APP_NAME } from "@loadout/shared";
import type { AgentRegistry } from "../agents/registry";
import type { CoreContext } from "../context";
import { invalid } from "../errors";
import { canonicalPath, pathsOverlap } from "../util/fs";
import { projectSkillDirs } from "./targets";

interface Guarded {
  path: string;
  what: string;
}

/** Folders the app already manages: the library, and every agent's own skills folder. */
function guardedFolders(ctx: CoreContext, registry: AgentRegistry): Guarded[] {
  return [
    { path: ctx.paths.baseDir, what: `the ${APP_NAME} library` },
    ...registry.list().map((agent) => ({
      path: agent.skillsDir,
      what: `the skills folder of ${agent.displayName}`,
    })),
  ];
}

function refuseOverlap(guarded: readonly Guarded[], path: string, label: string): void {
  const mine = canonicalPath(path);
  const hit = guarded.find((folder) => pathsOverlap(mine, canonicalPath(folder.path)));
  if (hit) {
    throw invalid(
      `${label} ${path} overlaps ${hit.what} (${hit.path}). ${APP_NAME} manages that folder already: pick another.`,
    );
  }
}

/**
 * A linked workspace's folders must stay clear of the library and of agents' own folders: the
 * app would otherwise treat one folder as two places, and its copies and removals would reach
 * into the other.
 */
export function refuseLinkedOverlap(
  ctx: CoreContext,
  registry: AgentRegistry,
  root: string,
  disabledRoot: string | null,
): void {
  const guarded = guardedFolders(ctx, registry);
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
  const [library, ...agents] = guardedFolders(ctx, registry);
  if (library) refuseOverlap([library], root, "The project");
  for (const dir of projectSkillDirs(registry)) {
    refuseOverlap(agents, join(root, dir), "Its skills folder");
  }
}
