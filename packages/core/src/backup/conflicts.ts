import { randomUUID } from "node:crypto";
import { existsSync, renameSync } from "node:fs";
import { basename, join } from "node:path";
import type { BackupConflict, ConflictResolution } from "@skillboard/shared";
import { AppError, notFound } from "../errors";
import type { PortableSkill } from "../skills/portable";
import { removePath, writeJsonAtomic } from "../util/fs";
import { firstFreeName } from "../util/names";
import { deleteConflict, findConflict } from "./conflict-store";
import { type BackupEnv, SKILL_METADATA_SUBDIR } from "./env";
import { createStage, extractPaths } from "./extract";
import { commitLibrary, commitStaged, resolveCommit } from "./repo";
import { tagSnapshot } from "./snapshots";

/**
 * The user's answer to a conflict. Whatever they pick, the state before it is committed and
 * tagged first, so the choice can always be undone from the snapshot list.
 */

const BEFORE_RESOLVE_MESSAGE = "backup: before resolving a conflict";
const RESOLVE_MESSAGE: Record<ConflictResolution, string> = {
  keep_local: "resolve conflict: keep local",
  use_remote: "resolve conflict: use remote",
  keep_both: "resolve conflict: keep both",
};
const REMOTE_COPY_SUFFIX = "-remote";

function metadataFile(env: BackupEnv, skillId: string): string {
  return join(env.ctx.paths.metadataDir, SKILL_METADATA_SUBDIR, `${skillId}.json`);
}

/** The other device's metadata for the skill at the conflicting commit, when it can be read. */
async function remoteMetadata(
  env: BackupEnv,
  conflict: BackupConflict,
): Promise<PortableSkill | null> {
  const file = `${env.metadataName}/${SKILL_METADATA_SUBDIR}/${conflict.skillKey}.json`;
  const result = await env.git.probe(["show", `${conflict.theirsCommit}:${file}`]);
  if (result.code !== 0) return null;
  try {
    return JSON.parse(result.stdout) as PortableSkill;
  } catch {
    return null;
  }
}

/** Check the remote version out into a scratch folder and hand back where it is. */
async function stageRemoteVersion(
  env: BackupEnv,
  conflict: BackupConflict,
): Promise<{ folder: string; cleanup: () => Promise<void> }> {
  const path = conflict.theirsPath;
  if (!path || !(await resolveCommit(env, conflict.theirsCommit))) {
    throw notFound(
      `The other device's version of "${conflict.skillName}" is no longer in the backup history. Choose "keep mine" to clear this conflict.`,
    );
  }
  const stage = createStage(env);
  try {
    await extractPaths(env, stage, conflict.theirsCommit, [path]);
    if (!existsSync(stage.pathOf(path))) {
      throw notFound(`The other device's version of "${conflict.skillName}" has no files.`);
    }
    return { folder: stage.pathOf(path), cleanup: stage.cleanup };
  } catch (error) {
    await stage.cleanup();
    throw error;
  }
}

async function useRemote(
  env: BackupEnv,
  conflict: BackupConflict,
  created: string[],
): Promise<void> {
  const local = env.store.find(conflict.skillKey);
  const meta = await remoteMetadata(env, conflict);
  const staged = await stageRemoteVersion(env, conflict);
  try {
    const isFree = (name: string): boolean => !existsSync(join(env.repoDir, name));
    // The skill keeps the folder it has here; if it was deleted meanwhile it gets its remote name.
    const folder = local
      ? basename(local.libraryPath)
      : firstFreeName(conflict.theirsPath ?? conflict.skillName, isFree);
    const target = join(env.repoDir, folder);
    await removePath(target);
    created.push(target);
    renameSync(staged.folder, target);
    const next: PortableSkill = {
      id: conflict.skillKey,
      path: folder,
      tags: meta?.tags ?? local?.tags ?? [],
      source: meta?.source ?? { type: local?.sourceType ?? "import" },
      createdAt: meta?.createdAt ?? local?.createdAt ?? Date.now(),
    };
    writeJsonAtomic(metadataFile(env, conflict.skillKey), next);
  } finally {
    await staged.cleanup();
  }
}

async function keepBoth(
  env: BackupEnv,
  conflict: BackupConflict,
  created: string[],
): Promise<void> {
  const local = env.store.find(conflict.skillKey);
  const meta = await remoteMetadata(env, conflict);
  const staged = await stageRemoteVersion(env, conflict);
  try {
    const stem = local ? basename(local.libraryPath) : (conflict.theirsPath ?? conflict.skillName);
    const folder = firstFreeName(
      `${stem}${REMOTE_COPY_SUFFIX}`,
      (name) => !existsSync(join(env.repoDir, name)),
    );
    // A new skill in its own right: new id, and no upstream to update from.
    const id = randomUUID();
    created.push(join(env.repoDir, folder), metadataFile(env, id));
    renameSync(staged.folder, join(env.repoDir, folder));
    const copy: PortableSkill = {
      id,
      path: folder,
      tags: meta?.tags ?? [],
      source: { type: "import" },
      createdAt: Date.now(),
    };
    writeJsonAtomic(metadataFile(env, id), copy);
  } finally {
    await staged.cleanup();
  }
}

/**
 * Apply the choice and return the safety snapshot taken just before.
 * Must run inside the library lock. Nothing is pushed until the next sync.
 */
export async function resolveConflict(
  env: BackupEnv,
  skillKey: string,
  action: ConflictResolution,
): Promise<string> {
  const conflict = findConflict(env.ctx.db, skillKey);
  if (!conflict) throw notFound("That conflict was already resolved.");
  if (!(action in RESOLVE_MESSAGE)) {
    throw new AppError("INVALID_INPUT", `Unknown conflict choice: ${String(action)}`);
  }

  await commitLibrary(env, BEFORE_RESOLVE_MESSAGE);
  const safety = await tagSnapshot(env);
  const created: string[] = [];
  try {
    if (action === "use_remote") await useRemote(env, conflict, created);
    if (action === "keep_both") await keepBoth(env, conflict, created);
    await commitStaged(env, RESOLVE_MESSAGE[action]);
  } catch (error) {
    // Take out what was moved in, then let git put the safety point back.
    for (const path of created) await removePath(path);
    await env.git.probe(["reset", "--hard", `refs/tags/${safety}`]);
    throw error;
  }
  deleteConflict(env.ctx.db, skillKey);
  env.ctx.activity.record("backup", conflict.skillName, RESOLVE_MESSAGE[action]);
  await env.reconcile(true);
  return safety;
}
