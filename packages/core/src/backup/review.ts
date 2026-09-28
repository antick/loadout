import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type {
  FileDiffEntry,
  SyncChange,
  SyncPreview,
  SyncPreviewItem,
  SyncSkillDiff,
} from "@loadout/shared";
import { notFound } from "../errors";
import type { PortableSkill } from "../skills/portable";
import { diffTrees } from "../updates/diff";
import { ensureDir, removePath } from "../util/fs";
import { findConflict } from "./conflict-store";
import { type BackupEnv, SKILL_METADATA_SUBDIR, isSafeSkillPath } from "./env";
import { createStage, extractPaths } from "./extract";
import { gitError } from "./git";
import { manyDeletes, planSides, readSides } from "./merge-input";
import { reportStage, withStages } from "./progress";
import { type SkillPlan, type SkillVersions, sameSkill } from "./merge-plan";
import { assertRepo, originUrl, requireBranch, resolveCommit, upstreamRef } from "./repo";
import { refreshIgnoreFile } from "./size";
import { fetchRemote } from "./sync";

/**
 * The sync review: what the next sync would bring in, send out and leave for a choice, worked
 * out by running the merge decision on a throwaway commit of the working tree. No ref, file or
 * index the library uses is changed; git only gains unreachable objects it cleans up itself.
 */

const PREVIEW_MESSAGE = "backup: preview";
const PREVIEW_INDEX_PREFIX = ".backup-preview-index-";
const AUTHOR_MARK = "\u0001";
const EMPTY_SIDE = "empty";

/** A preview with nothing in it. Fresh arrays every time: callers fill them in. */
function emptyPreview(): SyncPreview {
  return {
    remoteCommit: null,
    perSkill: true,
    incoming: [],
    outgoing: [],
    conflicts: [],
    presetsIncoming: 0,
    remoteBackups: 0,
    manyDeletes: false,
  };
}

/** A commit of the library as it is on disk now, parented on HEAD. Must run inside the lock. */
async function snapshotWorkingTree(env: BackupEnv): Promise<string> {
  // The same derived files a real commit writes first, so the preview sees what it would.
  env.portable.write();
  await refreshIgnoreFile(env);
  const index = join(env.siblingDir, `${PREVIEW_INDEX_PREFIX}${randomUUID()}`);
  const options = { env: { GIT_INDEX_FILE: index } };
  try {
    const head = await resolveCommit(env, "HEAD");
    if (head) await env.git.run(["read-tree", head], options);
    await env.git.run(["add", "-A"], options);
    const tree = await env.git.text(["write-tree"], options);
    const parents = head ? ["-p", head] : [];
    return await env.git.text(["commit-tree", tree, ...parents, "-m", PREVIEW_MESSAGE], options);
  } finally {
    await removePath(index);
  }
}

/** Newest author per top-level folder and per skill metadata file, in one `git log`. */
async function authorsIn(
  env: BackupEnv,
  range: string,
): Promise<(id: string, path?: string) => string | null> {
  const output = await env.git.text(["log", `--format=${AUTHOR_MARK}%an`, "--name-only", range], {
    globalArgs: ["-c", "core.quotePath=false"],
  });
  const byEntry = new Map<string, string>();
  const metadataPrefix = `${env.metadataName}/${SKILL_METADATA_SUBDIR}/`;
  let author = "";
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith(AUTHOR_MARK)) {
      author = line.slice(AUTHOR_MARK.length);
      continue;
    }
    if (!line) continue;
    const key = line.startsWith(metadataPrefix) ? line : (line.split("/")[0] ?? "");
    if (key && !byEntry.has(key)) byEntry.set(key, author);
  }
  return (id, path) =>
    byEntry.get(`${metadataPrefix}${id}.json`) ?? (path ? byEntry.get(path) : undefined) ?? null;
}

function contentChange(
  from: { treeHash: string | null; path: string },
  to: typeof from,
): SyncChange {
  if (from.treeHash !== to.treeHash) return "changed";
  return from.path === to.path ? "details" : "renamed";
}

interface Classified {
  incoming?: SyncChange;
  outgoing?: SyncChange;
  conflict?: boolean;
}

/** Which way each skill's change travels, from its three versions and the merge decision. */
function classify(versions: SkillVersions, plan: SkillPlan): Classified {
  const { base, ours, theirs } = versions;
  if (plan.outcome === "conflict") return { conflict: true };
  const result: Classified = {};
  if (plan.outcome === "deleted") result.incoming = "deleted";
  if (plan.outcome === "updated") {
    if (!ours) result.incoming = "added";
    else if (plan.content === "theirs" && theirs) result.incoming = contentChange(ours, theirs);
    else result.incoming = plan.path !== ours.path ? "renamed" : "details";
  }
  if (ours && !base && !theirs) result.outgoing = "added";
  if (ours && base && !sameSkill(base, ours)) result.outgoing = contentChange(base, ours);
  if (!ours && base && theirs && plan.content === "none") result.outgoing = "deleted";
  return result;
}

export function previewSync(env: BackupEnv): Promise<SyncPreview> {
  return withStages(env, () => buildPreview(env));
}

async function buildPreview(env: BackupEnv): Promise<SyncPreview> {
  assertRepo(env);
  if (!(await originUrl(env))) return emptyPreview();
  reportStage(env, "downloading");
  await fetchRemote(env);
  reportStage(env, "comparing");
  return env.ctx.lock.run("backup review", async () => {
    const branch = await requireBranch(env);
    const theirs = await resolveCommit(env, `refs/remotes/${upstreamRef(branch)}`);
    if (!theirs) return emptyPreview();
    const ours = await snapshotWorkingTree(env);
    const baseResult = await env.git.probe(["merge-base", ours, theirs]);
    const base = baseResult.code === 0 ? baseResult.stdout.trim() : "";
    if (!base) throw gitError("refusing to merge unrelated histories");
    const range = `${base}..${theirs}`;
    const remoteBackups = Number(await env.git.text(["rev-list", "--count", range])) || 0;
    const sides = await readSides(env, base, ours, theirs);
    if (!env.ctx.settings.get("skillAwareMerge") || !sides.describable) {
      return { ...emptyPreview(), remoteCommit: theirs, perSkill: false, remoteBackups };
    }

    const planned = planSides(env, sides);
    const author = await authorsIn(env, range);
    const preview: SyncPreview = {
      ...emptyPreview(),
      remoteCommit: theirs,
      remoteBackups,
      presetsIncoming: planned.plan.presets.filter((preset) => preset.take === "theirs").length,
      manyDeletes: manyDeletes(planned),
    };
    for (const plan of planned.plan.skills) {
      const versions = planned.skills.get(plan.id) ?? {};
      const { incoming, outgoing, conflict } = classify(versions, plan);
      const here = versions.ours ?? versions.base;
      const item = (change: SyncChange, fromDevice: string | null): SyncPreviewItem => ({
        id: plan.id,
        name: env.store.find(plan.id)?.name ?? plan.path ?? here?.path ?? plan.id,
        change,
        path: plan.path ?? here?.path ?? null,
        previousPath: change === "renamed" ? (here?.path ?? null) : null,
        fromDevice,
      });
      const remoteAuthor = author(plan.id, versions.theirs?.path ?? versions.base?.path);
      if (conflict) preview.conflicts.push(item("changed", remoteAuthor));
      if (incoming) preview.incoming.push(item(incoming, remoteAuthor));
      if (outgoing) preview.outgoing.push(item(outgoing, null));
    }
    return preview;
  });
}

/** The other device's metadata for a skill at a commit, when it is there and sane. */
async function metadataAt(
  env: BackupEnv,
  commit: string,
  id: string,
): Promise<PortableSkill | null> {
  const file = `${env.metadataName}/${SKILL_METADATA_SUBDIR}/${id}.json`;
  const result = await env.git.probe(["show", `${commit}:${file}`]);
  if (result.code !== 0) return null;
  try {
    const meta = JSON.parse(result.stdout) as PortableSkill;
    return meta.id === id && isSafeSkillPath(meta.path) ? meta : null;
  } catch {
    return null;
  }
}

/** Files that exist here but stay out of the backup are not part of any change. */
async function dropLeftOut(
  env: BackupEnv,
  folder: string | null,
  entries: FileDiffEntry[],
): Promise<FileDiffEntry[]> {
  const localOnly = entries.filter((entry) => entry.status === "removed");
  if (!folder || localOnly.length === 0) return entries;
  const result = await env.git.probe(["check-ignore", "-z", "--stdin"], {
    input: localOnly.map((entry) => `${folder}/${entry.path}\0`).join(""),
  });
  const ignored = new Set(result.stdout.split("\0").filter(Boolean));
  return entries.filter(
    (entry) => entry.status !== "removed" || !ignored.has(`${folder}/${entry.path}`),
  );
}

/** Compare the library folder `localFolder` with `remotePath` as it is in `commit`. */
async function diffWithCommit(
  env: BackupEnv,
  localFolder: string | null,
  commit: string,
  remotePath: string | null,
): Promise<FileDiffEntry[]> {
  const stage = createStage(env);
  try {
    const empty = stage.pathOf(EMPTY_SIDE);
    ensureDir(empty);
    if (remotePath) await extractPaths(env, stage, commit, [remotePath]);
    const before = localFolder ? join(env.repoDir, localFolder) : empty;
    const after = remotePath ? stage.pathOf(remotePath) : empty;
    return await dropLeftOut(env, localFolder, diffTrees(before, after));
  } finally {
    await stage.cleanup();
  }
}

function localFolderOf(env: BackupEnv, id: string): string | null {
  const skill = env.store.find(id);
  if (!skill) return null;
  const folder = skill.libraryPath.slice(env.repoDir.length + 1);
  return isSafeSkillPath(folder) ? folder : null;
}

export async function previewDiff(
  env: BackupEnv,
  skillId: string,
  remoteCommit: string,
): Promise<SyncSkillDiff> {
  assertRepo(env);
  const commit = await resolveCommit(env, remoteCommit);
  if (!commit) throw notFound("That remote state is no longer here. Review the sync again.");
  const meta = await metadataAt(env, commit, skillId);
  const local = localFolderOf(env, skillId);
  if (!meta && !local) throw notFound("That skill is neither here nor on the remote.");
  return {
    name: env.store.find(skillId)?.name ?? meta?.path ?? skillId,
    entries: await diffWithCommit(env, local, commit, meta?.path ?? null),
  };
}

export async function conflictDiff(env: BackupEnv, skillKey: string): Promise<SyncSkillDiff> {
  assertRepo(env);
  const conflict = findConflict(env.ctx.db, skillKey);
  if (!conflict) throw notFound("That conflict was already resolved.");
  const commit = await resolveCommit(env, conflict.theirsCommit);
  if (!commit) {
    throw notFound(
      `The other device's version of "${conflict.skillName}" is no longer in the backup history.`,
    );
  }
  const remotePath =
    conflict.theirsPath && isSafeSkillPath(conflict.theirsPath) ? conflict.theirsPath : null;
  return {
    name: conflict.skillName,
    entries: await diffWithCommit(env, localFolderOf(env, skillKey), commit, remotePath),
  };
}
