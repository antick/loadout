import { join } from "node:path";
import { HOUR_MS } from "@loadout/shared";
import { LIBRARY_PLACE } from "../storage/removed-library";
import { readDirSafe, removePath, statOrNull } from "../util/fs";
import { CLONE_DIR_PREFIX } from "./clone";
import type { BackupEnv } from "./env";
import { STAGE_ASIDE_DIR, STAGE_MOVES_DIR, STAGE_PREFIX } from "./extract";

/** Younger than this, a scratch folder may still be in use by a run of this or another process. */
const LEFTOVER_AGE_MS = HOUR_MS;

/**
 * Our folders a stage still holds, kept in Recently removed so they can be found and restored.
 * False when one could not be kept: the stage must then stay on disk.
 */
function keepOursFrom(env: BackupEnv, stage: string): boolean {
  let kept = true;
  for (const dir of [STAGE_ASIDE_DIR, STAGE_MOVES_DIR]) {
    for (const entry of readDirSafe(join(stage, dir))) {
      if (!entry.isDirectory()) continue;
      // Named after the skill id; the skill's folder now, when the library still has it.
      const dirName = env.store.find(entry.name)?.dirName ?? entry.name;
      try {
        env.removed.setAside(join(stage, dir, entry.name), {
          place: LIBRARY_PLACE,
          reason: "replaced",
          originalPath: join(env.repoDir, dirName),
        });
      } catch (error) {
        env.ctx.log.error(`Could not keep ${entry.name} from ${stage} in Recently removed`, error);
        kept = false;
      }
    }
  }
  return kept;
}

/**
 * Scratch folders a crash or an earlier failure left next to the library. A clone only ever
 * holds copies and the remote's files: it goes. A stage may hold folders of ours with files kept
 * out of the backup: those go to Recently removed first. Must run inside the library lock.
 */
export async function sweepLeftovers(env: BackupEnv, now = Date.now()): Promise<void> {
  for (const entry of readDirSafe(env.siblingDir)) {
    const isClone = entry.name.startsWith(CLONE_DIR_PREFIX);
    const isStage = entry.name.startsWith(STAGE_PREFIX);
    if (!entry.isDirectory() || (!isClone && !isStage)) continue;
    const path = join(env.siblingDir, entry.name);
    const age = now - (statOrNull(path)?.mtimeMs ?? now);
    if (age < LEFTOVER_AGE_MS) continue;
    if (isStage && !keepOursFrom(env, path)) continue;
    env.ctx.log.info(`Removing a scratch folder left behind: ${path}`);
    await removePath(path);
  }
}
