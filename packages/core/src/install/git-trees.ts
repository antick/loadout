import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isCommitId } from "@loadout/shared";
import { removePath } from "../util/fs";
import { OBJECT_NAME_FORMAT, batchInput, isBatchName, parseBatchCheck } from "../util/git-batch";
import type { RunGit } from "./git-sparse";

/**
 * Git's tree id of a folder names its whole content: the same id at two commits means not one
 * file in it changed. Reading ids needs commits and trees only, never file contents, so an
 * update check can tell "this skill's folder changed" from "another skill in the repository
 * changed" for a few kilobytes. The fetch goes into a throwaway bare repository, so the clone
 * cache that installs and updates use is never touched.
 */

/** Revision → one tree id per asked path, in order; null where it could not be read. */
export type FolderTrees = Map<string, (string | null)[]>;

const TREES_DIR_PREFIX = "trees-";
/** Commits and trees only: every file's content stays on the server. */
const TREES_FILTER = "--filter=blob:none";

/**
 * The id each `revision:path` names, null where none: one git process for them all, asking for
 * ids alone so no object is opened. A name `cat-file` cannot take on one line is asked alone.
 */
async function objectIds(
  run: RunGit,
  dir: string,
  specs: readonly string[],
): Promise<(string | null)[]> {
  const batched = specs.filter(isBatchName);
  const found = await run(["cat-file", `--batch-check=${OBJECT_NAME_FORMAT}`], {
    cwd: dir,
    input: batchInput(batched),
  });
  const answers = found.code === 0 ? parseBatchCheck(found.stdout, batched.length) : [];
  let next = 0;
  const ids: (string | null)[] = [];
  for (const spec of specs) {
    if (isBatchName(spec)) {
      ids.push(answers[next] ?? null);
      next += 1;
      continue;
    }
    const alone = await run(["rev-parse", "--verify", "--quiet", spec], { cwd: dir });
    ids.push(alone.code === 0 ? alone.stdout.trim() || null : null);
  }
  return ids;
}

export async function readFolderTrees(
  run: RunGit,
  tempPrefix: string,
  url: string,
  revisions: readonly string[],
  paths: readonly string[],
  signal?: AbortSignal,
): Promise<FolderTrees> {
  const trees: FolderTrees = new Map();
  // Only exact commits: a name could be read as an option or mean another ref by now.
  const wanted = [...new Set(revisions)].filter(isCommitId);
  if (wanted.length === 0 || paths.length === 0) return trees;
  const dir = mkdtempSync(join(tmpdir(), `${tempPrefix}${TREES_DIR_PREFIX}`));
  try {
    if ((await run(["init", "--bare", "--quiet", dir], {})).code !== 0) return trees;
    const fetched = await run(
      ["fetch", "--quiet", "--depth", "1", TREES_FILTER, "--no-tags", "--", url, ...wanted],
      { network: true, cwd: dir, signal },
    );
    if (fetched.code !== 0) return trees;
    // Everything after the colon is the path, so no `^{tree}` here: a file gives its blob id.
    const specs = wanted.flatMap((revision) =>
      paths.map((path) => `${revision}:${path.replace(/^\/+|\/+$/g, "")}`),
    );
    const ids = await objectIds(run, dir, specs);
    wanted.forEach((revision, index) => {
      trees.set(revision, ids.slice(index * paths.length, (index + 1) * paths.length));
    });
    return trees;
  } finally {
    await removePath(dir);
  }
}
