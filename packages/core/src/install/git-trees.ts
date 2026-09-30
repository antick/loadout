import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExecResult } from "../util/exec";
import { removePath } from "../util/fs";

/**
 * Git's tree id of a folder names its whole content: the same id at two commits means not one
 * file in it changed. Reading ids needs commits and trees only, never file contents, so an
 * update check can tell "this skill's folder changed" from "another skill in the repository
 * changed" for a few kilobytes. The fetch goes into a throwaway bare repository, so the clone
 * cache that installs and updates use is never touched.
 */

type Run = (
  args: string[],
  call: { network?: boolean; cwd?: string; signal?: AbortSignal },
) => Promise<ExecResult>;

/** Revision → one tree id per asked path, in order; null where it could not be read. */
export type FolderTrees = Map<string, (string | null)[]>;

const TREES_DIR_PREFIX = "trees-";
/** Commits and trees only: every file's content stays on the server. */
const TREES_FILTER = "--filter=blob:none";
const SHA = /^[0-9a-f]{40,64}$/i;

export async function readFolderTrees(
  run: Run,
  tempPrefix: string,
  url: string,
  revisions: readonly string[],
  paths: readonly string[],
  signal?: AbortSignal,
): Promise<FolderTrees> {
  const trees: FolderTrees = new Map();
  // Only exact commits: a name could be read as an option or mean another ref by now.
  const wanted = [...new Set(revisions)].filter((revision) => SHA.test(revision));
  if (wanted.length === 0 || paths.length === 0) return trees;
  const dir = mkdtempSync(join(tmpdir(), `${tempPrefix}${TREES_DIR_PREFIX}`));
  try {
    if ((await run(["init", "--bare", "--quiet", dir], {})).code !== 0) return trees;
    const fetched = await run(
      ["fetch", "--quiet", "--depth", "1", TREES_FILTER, "--no-tags", "--", url, ...wanted],
      { network: true, cwd: dir, signal },
    );
    if (fetched.code !== 0) return trees;
    for (const revision of wanted) {
      const ids: (string | null)[] = [];
      for (const path of paths) {
        const spec = `${revision}:${path.replace(/^\/+|\/+$/g, "")}`;
        // Everything after the colon is the path, so no `^{tree}` here: a file gives its blob id.
        const found = await run(["rev-parse", "--verify", "--quiet", spec], { cwd: dir });
        ids.push(found.code === 0 ? found.stdout.trim() || null : null);
      }
      trees.set(revision, ids);
    }
    return trees;
  } finally {
    await removePath(dir);
  }
}
