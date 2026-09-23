import { unlinkSync } from "node:fs";
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
 * Remove links in agent folders that lead into the library's skills folder but no longer reach
 * anything: the skill folder, or the whole library, was deleted outside the app. Only such links
 * are touched; a link elsewhere, or one that still resolves, is left alone. Returns their paths.
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
  for (const folder of folders.values()) {
    for (const entry of readDirSafe(folder)) {
      const path = join(folder, entry.name);
      if (!isDanglingLink(path)) continue;
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
