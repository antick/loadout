import { existsSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AgentRegistry } from "../agents/registry";
import type { CoreContext } from "../context";
import type { SkillStore } from "../skills/store";
import {
  canonicalPath,
  isDanglingLink,
  isInside,
  linkTargetOf,
  readDirSafe,
  targetIdentity,
} from "../util/fs";

/**
 * Links recorded for skills that are still expected back or have moved: a skill whose folder a
 * re-index found missing (still in its grace period), or one whose folder was renamed by hand.
 * Their links lead nowhere for now, but the deployment stays and is put back.
 */
function keptLinks(store: SkillStore): Set<string> {
  const waiting = store.missingSince();
  const present = new Set(
    store
      .list()
      .filter((skill) => existsSync(skill.libraryPath))
      .map((skill) => skill.id),
  );
  const kept = new Set<string>();
  for (const row of store.deployments()) {
    if (row.mode !== "symlink") continue;
    if (waiting.has(row.skillId) || present.has(row.skillId)) {
      kept.add(targetIdentity(row.targetPath));
    }
  }
  return kept;
}

/**
 * Remove links in agent folders that lead into the library's skills folder but no longer reach
 * anything: the skill folder, or the whole library, was deleted outside the app. Only such links
 * are touched; a link elsewhere, one that still resolves, or one kept for a skill that is
 * expected back (see `keptLinks`) is left alone. Returns their paths.
 */
export function pruneBrokenLinks(
  ctx: CoreContext,
  deps: { registry: AgentRegistry; store: SkillStore },
): string[] {
  const roots = [resolve(ctx.paths.skillsDir), canonicalPath(ctx.paths.skillsDir)];
  // Agents sharing a folder are scanned once, under the first agent's spelling of it.
  const folders = new Map<string, string>();
  for (const agent of deps.registry.list()) {
    const key = canonicalPath(agent.skillsDir);
    if (!folders.has(key)) folders.set(key, agent.skillsDir);
  }
  const removed: string[] = [];
  let kept: Set<string> | null = null;
  for (const folder of folders.values()) {
    for (const entry of readDirSafe(folder)) {
      const path = join(folder, entry.name);
      if (!isDanglingLink(path)) continue;
      kept ??= keptLinks(deps.store);
      if (kept.has(targetIdentity(path))) continue;
      const target = linkTargetOf(path);
      if (!target || !roots.some((root) => isInside(root, target))) continue;
      try {
        unlinkSync(path);
        removed.push(path);
      } catch (error) {
        ctx.log.warn(`Could not remove the broken link ${path}`, error);
      }
    }
  }
  if (removed.length === 0) return removed;
  const gone = new Set(removed.map(targetIdentity));
  for (const row of deps.store.deployments()) {
    if (gone.has(targetIdentity(row.targetPath))) {
      deps.store.deleteDeployment(row.skillId, row.agentKey);
    }
  }
  ctx.log.info(`Removed ${removed.length} links to skills that no longer exist`);
  return removed;
}
