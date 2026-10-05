import { randomUUID } from "node:crypto";
import { existsSync, renameSync } from "node:fs";
import { basename, join } from "node:path";
import { type BackupConflict, type ConflictResolution, firstFreeName } from "@loadout/shared";
import { AppError, notFound } from "../errors";
import { type PortableSkill, toPortableSkill } from "../skills/portable";
import { isInside, removePath, writeJsonAtomic } from "../util/fs";
import { deleteConflict, findConflict } from "./conflict-store";
import { type BackupEnv, SKILL_METADATA_SUBDIR } from "./env";
import { type Stage, createStage, extractPaths } from "./extract";
import { skillMetadataAt } from "./merge-read";
import {
  type SetAsideFolder,
  localFilesNotKept,
  putBackFolder,
  setAsideFolder,
  settleSetAside,
} from "./ignored";
import { commitLibrary, commitStaged, resolveCommit } from "./repo";
import { safetyPoint } from "./snapshots";

/**
 * The user's answer to a conflict. Whatever they pick, the state before it is committed first,
 * so the choice can always be undone from the snapshot list.
 */

const BEFORE_RESOLVE_MESSAGE = "backup: before resolving a conflict";
const RESOLVE_MESSAGE: Record<ConflictResolution, string> = {
  keep_local: "resolve conflict: keep local",
  use_remote: "resolve conflict: use remote",
  keep_both: "resolve conflict: keep both",
};
const REMOTE_COPY_SUFFIX = "-remote";
const LOCAL_ASIDE_KEY = "local";

/** What a choice changed on disk, so a failure can be undone and the rest finished after it. */
interface ChoiceWork {
  /** Folders and files moved into the library. */
  created: string[];
  /** Our folders that were replaced; put back on failure, their left-out files carried after. */
  replaced: { aside: SetAsideFolder; target: string }[];
  /** Scratch folders to remove at the very end; one holding files the user must see is kept. */
  stages: Stage[];
}

function metadataFile(env: BackupEnv, skillId: string): string {
  return join(env.ctx.paths.metadataDir, SKILL_METADATA_SUBDIR, `${skillId}.json`);
}

/** The other device's metadata for the skill at the conflicting commit, when it can be read. */
function remoteMetadata(env: BackupEnv, conflict: BackupConflict): Promise<PortableSkill | null> {
  return skillMetadataAt(env, conflict.theirsCommit, conflict.skillKey);
}

/** Check the remote version out into a scratch folder and hand back where it is. */
async function stageRemoteVersion(
  env: BackupEnv,
  conflict: BackupConflict,
): Promise<{ folder: string; stage: Stage }> {
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
    return { folder: stage.pathOf(path), stage };
  } catch (error) {
    await stage.cleanup();
    throw error;
  }
}

async function useRemote(
  env: BackupEnv,
  conflict: BackupConflict,
  work: ChoiceWork,
): Promise<void> {
  const local = env.store.find(conflict.skillKey);
  const meta = await remoteMetadata(env, conflict);
  const staged = await stageRemoteVersion(env, conflict);
  work.stages.push(staged.stage);
  const isFree = (name: string): boolean => !existsSync(join(env.repoDir, name));
  // The skill keeps the folder it has here; if it was deleted meanwhile it gets its remote name.
  const folder = local
    ? basename(local.libraryPath)
    : firstFreeName(conflict.theirsPath ?? conflict.skillName, isFree);
  const target = join(env.repoDir, folder);
  const aside = await setAsideFolder(env, staged.stage, folder, LOCAL_ASIDE_KEY);
  if (aside) work.replaced.push({ aside, target });
  work.created.push(target);
  renameSync(staged.folder, target);
  // The other device's metadata wins; what it leaves out (a block, a note) stays as it is here.
  const next: PortableSkill = {
    tags: [],
    source: { type: "import" },
    createdAt: Date.now(),
    ...(local ? toPortableSkill(local) : {}),
    ...meta,
    // The edited files describe the content, which now comes from the other device.
    editedFiles: meta?.editedFiles,
    id: conflict.skillKey,
    path: folder,
  };
  writeJsonAtomic(metadataFile(env, conflict.skillKey), next);
}

async function keepBoth(env: BackupEnv, conflict: BackupConflict, work: ChoiceWork): Promise<void> {
  const { created } = work;
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
    await staged.stage.cleanup();
  }
}

/**
 * Apply one choice to several conflicts at once, behind one safety snapshot. All or nothing: when
 * one skill fails, every one is put back as it was. Conflicts resolved meanwhile are skipped.
 * Must run inside the library lock. Nothing is pushed until the next sync.
 */
export async function resolveConflicts(
  env: BackupEnv,
  skillKeys: readonly string[],
  action: ConflictResolution,
): Promise<string> {
  if (!(action in RESOLVE_MESSAGE)) {
    throw new AppError("INVALID_INPUT", `Unknown conflict choice: ${String(action)}`);
  }
  if (!Array.isArray(skillKeys) || skillKeys.some((key) => typeof key !== "string")) {
    throw new AppError("INVALID_INPUT", "Expected a list of skill ids.");
  }
  const conflicts = [...new Set(skillKeys)]
    .map((skillKey) => findConflict(env.ctx.db, skillKey))
    .filter((conflict): conflict is BackupConflict => conflict !== null);
  if (conflicts.length === 0) {
    throw notFound(
      skillKeys.length > 1
        ? "Those conflicts were already resolved."
        : "That conflict was already resolved.",
    );
  }

  await commitLibrary(env, BEFORE_RESOLVE_MESSAGE);
  const safety = await safetyPoint(env);
  const work: ChoiceWork = { created: [], replaced: [], stages: [] };
  let leftIn: string | null = null;
  const message =
    conflicts.length > 1
      ? `${RESOLVE_MESSAGE[action]} (${conflicts.length} skills)`
      : RESOLVE_MESSAGE[action];
  try {
    try {
      for (const conflict of conflicts) {
        if (action === "use_remote") await useRemote(env, conflict, work);
        if (action === "keep_both") await keepBoth(env, conflict, work);
      }
      await commitStaged(env, message);
    } catch (error) {
      // Take out what was moved in, put our folders back, then let git restore the safety point.
      for (const path of work.created) await removePath(path);
      for (const { aside } of work.replaced) putBackFolder(aside);
      await env.git.probe(["reset", "--hard", safety]);
      throw error;
    }
    // Files kept out of the backup exist only here: they stay with the skill, or are kept in
    // Recently removed. When neither worked, the scratch folder holding them stays on disk.
    for (const { aside, target } of work.replaced) {
      if (settleSetAside(env, aside, target)) continue;
      work.stages = work.stages.filter((stage) => !isInside(stage.dir, aside.to));
      leftIn ??= aside.to;
    }
  } finally {
    for (const stage of work.stages) await stage.cleanup();
  }
  for (const conflict of conflicts) {
    deleteConflict(env.ctx.db, conflict.skillKey);
    env.ctx.activity.record("backup", conflict.skillName, RESOLVE_MESSAGE[action]);
  }
  await env.reconcile(true);
  // The choice is made and committed; only those files still need the user.
  if (leftIn) throw localFilesNotKept(leftIn);
  return safety;
}
