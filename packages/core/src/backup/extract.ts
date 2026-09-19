import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { ensureDir, removePath } from "../util/fs";
import type { BackupEnv } from "./env";

/**
 * Copy folders out of any commit without touching the library folder or the real index:
 * git checks them out into a scratch work tree, through a scratch index.
 */

const STAGE_PREFIX = ".backup-stage-";
const SCRATCH_INDEX = ".scratch-index";
/** Keeps one git call's argument list far below the smallest OS limit (Windows, 32k chars). */
const PATHS_PER_CALL = 50;

export interface Stage {
  dir: string;
  /** Where `path` from the commit ended up. */
  pathOf(path: string): string;
  cleanup(): Promise<void>;
}

/** A scratch folder next to the library, on the same disk so results can be moved in by rename. */
export function createStage(env: BackupEnv): Stage {
  const dir = join(env.siblingDir, `${STAGE_PREFIX}${randomUUID()}`);
  ensureDir(dir);
  return { dir, pathOf: (path) => join(dir, path), cleanup: () => removePath(dir) };
}

export async function extractPaths(
  env: BackupEnv,
  stage: Stage,
  commit: string,
  paths: string[],
): Promise<void> {
  for (let start = 0; start < paths.length; start += PATHS_PER_CALL) {
    await env.git.run(["checkout", commit, "--", ...paths.slice(start, start + PATHS_PER_CALL)], {
      cwd: stage.dir,
      globalArgs: [
        `--git-dir=${join(env.repoDir, ".git")}`,
        `--work-tree=${stage.dir}`,
        "--literal-pathspecs",
      ],
      env: { GIT_INDEX_FILE: join(stage.dir, SCRATCH_INDEX) },
    });
  }
}
