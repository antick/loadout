import { AppError } from "../errors";
import type { BackupEnv } from "./env";
import { assertRepo, commitLibrary, requireBranch, resolveCommit, upstreamRef } from "./repo";
import { scanCurrentFiles, secretsFound } from "./secrets";
import { pullRemote } from "./sync";

const CLEANED_MESSAGE = "backup: sync skills library (unpushed history cleaned up)";

/**
 * For a key that is out of the files but still in commits never pushed: fold every unpushed
 * commit into one that holds only today's files, on top of what the remote has. Safe because
 * none of those commits left this computer; nothing on the remote is rewritten.
 */
export async function cleanUpUnpushed(env: BackupEnv): Promise<void> {
  assertRepo(env);
  const branch = await requireBranch(env);
  // Still in a file: cleaning the history would only commit it again.
  const inFiles = await scanCurrentFiles(env, branch);
  if (inFiles.length > 0) throw secretsFound(inFiles);

  let upstream = await resolveCommit(env, `refs/remotes/${upstreamRef(branch)}`);
  // The new commit sits on the remote's state, so ours must already contain it: bring it in.
  if (upstream && !(await isAncestor(env, upstream))) {
    await pullRemote(env);
    upstream = await resolveCommit(env, `refs/remotes/${upstreamRef(branch)}`);
    if (upstream && !(await isAncestor(env, upstream))) {
      throw new AppError(
        "SYNC_CONFLICT",
        "Bring in the other computer's changes first, then try again.",
      );
    }
  }

  await env.ctx.lock.run("clean up unpushed history", async () => {
    await commitLibrary(env, CLEANED_MESSAGE);
    const tree = await env.git.text(["rev-parse", "HEAD^{tree}"]);
    const commit = await env.git.text([
      "commit-tree",
      tree,
      ...(upstream ? ["-p", upstream] : []),
      "-m",
      CLEANED_MESSAGE,
    ]);
    await env.git.run(["update-ref", `refs/heads/${branch}`, commit]);
  });
  env.ctx.activity.record("backup", env.deviceName(), "Unpushed history cleaned up");
  env.ctx.touched("backup");
}

async function isAncestor(env: BackupEnv, commit: string): Promise<boolean> {
  const result = await env.git.probe(["merge-base", "--is-ancestor", commit, "HEAD"]);
  return result.code === 0;
}
