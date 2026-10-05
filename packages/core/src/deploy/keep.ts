import type { BatchFailure } from "@loadout/shared";
import type { CoreContext } from "../context";
import { errorMessage } from "../errors";
import type { SkillStore } from "../skills/store";
import { dirSize, replaceDirAtomic } from "../util/fs";
import { linkPointsAt, removeTarget } from "./engine";

/** Links in agent folders that point into the library, one entry per folder on disk. */
export interface LinkedFolders {
  /** Folders that are links now and would become real folders. */
  folders: number;
  /** Disk space the copies would take. */
  bytes: number;
}

export interface KeepResult {
  /** Links replaced by a real copy of the skill. */
  converted: number;
  failed: BatchFailure[];
}

/** Every link row, grouped by the folder on disk (agents sharing a folder share one link). */
function linksByPath(store: SkillStore): Map<string, { skillId: string; agentKeys: string[] }> {
  const groups = new Map<string, { skillId: string; agentKeys: string[] }>();
  for (const row of store.deployments()) {
    if (row.mode !== "symlink") continue;
    const group = groups.get(row.targetPath);
    if (group) group.agentKeys.push(row.agentKey);
    else groups.set(row.targetPath, { skillId: row.skillId, agentKeys: [row.agentKey] });
  }
  return groups;
}

/** What turning every link into a folder would involve. Reads only. */
export function linkedFolders(store: SkillStore): LinkedFolders {
  let folders = 0;
  let bytes = 0;
  for (const [path, { skillId }] of linksByPath(store)) {
    const skill = store.find(skillId);
    if (!skill || !linkPointsAt(path, skill.libraryPath)) continue;
    folders += 1;
    bytes += dirSize(skill.libraryPath);
  }
  return { folders, bytes };
}

/**
 * Replace every link Loadout put in an agent folder with a real copy of the skill, so agents
 * keep their skills once the library is gone. Only a link that still points at its library
 * skill is touched; the copy is complete before the link goes. Deployment rows become copies.
 */
export async function keepLinkedSkills(ctx: CoreContext, store: SkillStore): Promise<KeepResult> {
  return ctx.lock.run("keep skills in agent folders", async () => {
    const result: KeepResult = { converted: 0, failed: [] };
    for (const [path, { skillId, agentKeys }] of linksByPath(store)) {
      const skill = store.find(skillId);
      if (!skill || !linkPointsAt(path, skill.libraryPath)) continue;
      const name = `${skill.name} (${agentKeys.join(", ")})`;
      try {
        // Staged beside the link and swapped in whole, so an agent never sees half a skill and a
        // failure leaves the link as it was. The replaced link is unlinked, never followed.
        await replaceDirAtomic(skill.libraryPath, path, {
          skipSymlinks: false,
          keepReplaced: (link) => {
            removeTarget(link, "symlink");
          },
        });
      } catch (error) {
        result.failed.push({ name, message: errorMessage(error) });
        continue;
      }
      for (const agentKey of agentKeys) {
        store.upsertDeployment(skill.id, agentKey, path, "copy", skill.contentHash);
      }
      result.converted += 1;
    }
    if (result.converted > 0) ctx.touched("skills");
    ctx.log.info(
      `Kept ${result.converted} linked skills as folders; ${result.failed.length} failed`,
    );
    return result;
  });
}
