import { existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import type { MergeSummary, MergedSkill } from "@loadout/shared";
import { AppError } from "../errors";
import { readSkillIdentity } from "../skills/metadata";
import { ensureDir, removePath, writeFileAtomic } from "../util/fs";
import { firstFreeName } from "../util/names";
import { assertReadable, schemaAt } from "./compat";
import { countConflicts, listConflicts, recordConflict } from "./conflict-store";
import { type BackupEnv, PRESET_METADATA_SUBDIR, SKILL_METADATA_SUBDIR } from "./env";
import { type Stage, createStage, extractPaths } from "./extract";
import { gitError } from "./git";
import {
  type MergePlan,
  type PresetVersions,
  type ResidualVersions,
  type SkillPlan,
  type SkillVersions,
  planMerge,
} from "./merge-plan";
import { type CommitSnapshot, readCommit } from "./merge-read";
import { commitLibrary, requireBranch, resolveCommit, upstreamRef } from "./repo";

/**
 * Brings the remote branch into the library. With the skill-aware setting on, the decision is
 * made per skill (see `merge-plan.ts`) and written as a real two-parent merge commit, so plain
 * git commands still see ordinary history. A content conflict never stops the merge: our version
 * stays on disk and the remote one is remembered for the user to choose later.
 */

const BEFORE_MERGE_MESSAGE = "backup: before merge";
const MERGE_MESSAGE_PREFIX = "merge: sync from ";
const UNKNOWN_DEVICE = "another device";
const MOVES_DIR = ".moves";

export interface MergeResult {
  summary: MergeSummary;
  /** Local changes had to be committed before merging. */
  committed: boolean;
  /** The library now holds something it did not hold before. */
  changed: boolean;
}

const UP_TO_DATE: MergeSummary = {
  upToDate: true,
  fastForward: false,
  updated: [],
  keptLocal: [],
  newConflicts: [],
  pendingTotal: 0,
};

function collect<T>(
  sides: { base: Map<string, T>; ours: Map<string, T>; theirs: Map<string, T> },
  skip: (key: string) => boolean = () => false,
): Map<string, { base?: T; ours?: T; theirs?: T }> {
  const merged = new Map<string, { base?: T; ours?: T; theirs?: T }>();
  for (const side of ["base", "ours", "theirs"] as const) {
    for (const [key, value] of sides[side]) {
      if (skip(key)) continue;
      merged.set(key, { ...merged.get(key), [side]: value });
    }
  }
  return merged;
}

function skillName(env: BackupEnv, path: string): string {
  return readSkillIdentity(join(env.repoDir, path)).name;
}

async function lastAuthor(env: BackupEnv, range: string, paths: string[]): Promise<string> {
  const result = await env.git.probe(["log", "-1", "--format=%an", range, "--", ...paths], {
    globalArgs: ["--literal-pathspecs"],
  });
  return (result.code === 0 && result.stdout.trim()) || UNKNOWN_DEVICE;
}

async function remoteDevices(env: BackupEnv, range: string): Promise<string> {
  const authors = await env.git.text(["log", "--format=%an", range]);
  const names = [...new Set(authors.split(/\r?\n/).filter(Boolean))];
  return names.length > 0 ? names.join(", ") : UNKNOWN_DEVICE;
}

function writeIfChanged(path: string, text: string): void {
  if (existsSync(path) && readFileSync(path, "utf8") === text) return;
  writeFileAtomic(path, text);
}

/** Next name that is free both on disk (an untracked folder may be in the way) and in the plan. */
function freeFolder(env: BackupEnv, wanted: string, planned: Set<string>): string {
  return firstFreeName(
    wanted,
    (name) => !existsSync(join(env.repoDir, name)) && (name === wanted || !planned.has(name)),
  );
}

/** Put the planned library on disk and commit it as a merge of `theirs`. */
async function materialise(
  env: BackupEnv,
  plan: MergePlan,
  skills: Map<string, SkillVersions>,
  presets: Map<string, PresetVersions>,
  theirs: CommitSnapshot,
  message: string,
): Promise<void> {
  const stage: Stage = createStage(env);
  const created: string[] = [];
  const planned = new Set(plan.skills.flatMap((item) => (item.path ? [item.path] : [])));
  const place = (item: SkillPlan, from: string): void => {
    if (!item.path || !existsSync(from)) return;
    const folder = freeFolder(env, item.path, planned);
    if (folder !== item.path) {
      planned.add(folder);
      item.path = folder;
      if (item.meta) item.meta = { ...item.meta, path: folder };
    }
    const target = join(env.repoDir, folder);
    created.push(target);
    renameSync(from, target);
  };

  try {
    // Everything that can fail slowly (reading git objects) happens before the library is touched.
    const incoming = plan.skills.filter(
      (item) => item.content === "theirs" && skills.get(item.id)?.theirs?.treeHash,
    );
    await extractPaths(
      env,
      stage,
      theirs.commit,
      incoming.flatMap((item) => skills.get(item.id)?.theirs?.path ?? []),
    );
    await env.git.run(["merge", "--no-commit", "--no-ff", "-s", "ours", theirs.commit]);

    const movers: SkillPlan[] = [];
    for (const item of plan.skills) {
      const ours = skills.get(item.id)?.ours;
      if (!ours) continue;
      if (item.content !== "ours") await removePath(join(env.repoDir, ours.path));
      else if (item.path !== ours.path) movers.push(item);
    }
    // Two steps, so that skills swapping folder names do not trip over each other.
    ensureDir(stage.pathOf(MOVES_DIR));
    for (const item of movers) {
      const from = join(env.repoDir, skills.get(item.id)?.ours?.path ?? "");
      if (existsSync(from)) renameSync(from, stage.pathOf(join(MOVES_DIR, item.id)));
    }
    for (const item of movers) place(item, stage.pathOf(join(MOVES_DIR, item.id)));
    for (const item of incoming) {
      place(item, stage.pathOf(skills.get(item.id)?.theirs?.path ?? item.id));
    }

    for (const entry of plan.residual) {
      await removePath(join(env.repoDir, entry.name));
      if (entry.action === "checkout") {
        await env.git.run(["checkout", theirs.commit, "--", entry.name], {
          globalArgs: ["--literal-pathspecs"],
        });
      }
    }

    const metadataDir = env.ctx.paths.metadataDir;
    for (const item of plan.skills) {
      const file = join(metadataDir, SKILL_METADATA_SUBDIR, `${item.id}.json`);
      if (item.meta) writeIfChanged(file, `${JSON.stringify(item.meta, null, 2)}\n`);
      // Only a skill we really had is removed; an unreadable file of ours is left for the user.
      else if (skills.get(item.id)?.ours) await removePath(file);
    }
    for (const item of plan.presets) {
      if (item.take !== "theirs") continue;
      const file = join(metadataDir, PRESET_METADATA_SUBDIR, `${item.id}.json`);
      const raw = presets.get(item.id)?.theirs?.raw;
      if (raw === undefined) await removePath(file);
      else writeIfChanged(file, raw);
    }

    await env.git.run(["add", "-A"]);
    await env.git.run(["commit", "-q", "-m", message]);
  } catch (error) {
    // Back to our last commit: take out what was moved in, then let git restore the rest.
    for (const path of created) await removePath(path);
    await env.git.probe(["reset", "--hard", "HEAD"]);
    throw error;
  } finally {
    await stage.cleanup();
  }
}

/** Line-based `git merge`, for users who switched the skill-aware merge off. */
async function plainMerge(env: BackupEnv, theirs: string, message: string): Promise<void> {
  const result = await env.git.probe(["merge", "--no-edit", "-m", message, theirs]);
  if (result.code === 0) return;
  await env.git.probe(["merge", "--abort"]);
  const output = `${result.stderr}\n${result.stdout}`;
  if (/conflict/i.test(output)) {
    throw new AppError(
      "SYNC_CONFLICT",
      "The same files were changed on two devices and Git could not merge them line by line. Turn on the skill-aware merge in Settings, or restore the library from the backup remote.",
      { detail: gitError(output).details?.detail },
    );
  }
  throw gitError(output);
}

/** Skills whose folder differs between two commits, for merges made without a plan. */
async function changedSkills(env: BackupEnv, from: string, range: string): Promise<MergedSkill[]> {
  const diff = await env.git.run(["diff", "--name-only", "-z", from, "HEAD"]);
  const folders = new Set<string>();
  for (const path of diff.stdout.split("\0")) {
    const top = path.split("/")[0] ?? "";
    if (top && !top.startsWith(".") && existsSync(join(env.repoDir, top))) folders.add(top);
  }
  const updated: MergedSkill[] = [];
  for (const folder of [...folders].sort()) {
    updated.push({
      name: skillName(env, folder),
      fromDevice: await lastAuthor(env, range, [folder]),
    });
  }
  return updated;
}

/**
 * Merge `origin/<branch>` as last fetched. Must run inside the library lock; does no network.
 * Pending local changes are committed first so the merge always starts from a clean folder.
 */
export async function mergeRemote(env: BackupEnv): Promise<MergeResult> {
  const committed = await commitLibrary(env, BEFORE_MERGE_MESSAGE);
  const branch = await requireBranch(env);
  const ours = await resolveCommit(env, "HEAD");
  const theirs = await resolveCommit(env, `refs/remotes/${upstreamRef(branch)}`);
  if (theirs) assertReadable(await schemaAt(env, theirs));
  const idle = (): MergeResult => ({
    summary: { ...UP_TO_DATE, pendingTotal: countConflicts(env.ctx.db) },
    committed,
    changed: false,
  });
  if (!ours || !theirs || ours === theirs) return idle();

  const baseResult = await env.git.probe(["merge-base", ours, theirs]);
  const base = baseResult.code === 0 ? baseResult.stdout.trim() : "";
  if (!base) throw gitError("refusing to merge unrelated histories");
  if (base === theirs) return idle();

  const range = `${base}..${theirs}`;
  const message = `${MERGE_MESSAGE_PREFIX}${await remoteDevices(env, range)}`;

  const [baseSide, ourSide, theirSide] = await Promise.all([
    readCommit(env, base),
    readCommit(env, ours),
    readCommit(env, theirs),
  ]);
  // A side without our metadata folder (a repository filled by hand, or by something else) would
  // read as "every skill was deleted". Git's own line merge is the only safe answer there.
  const describable = [ourSide, theirSide].every((side) => side.entries.has(env.metadataName));

  if (!env.ctx.settings.get("skillAwareMerge") || !describable) {
    await plainMerge(env, theirs, message);
    const summary: MergeSummary = {
      ...UP_TO_DATE,
      upToDate: false,
      fastForward: base === ours,
      updated: await changedSkills(env, ours, range),
      pendingTotal: countConflicts(env.ctx.db),
    };
    await env.reconcile(true);
    return { summary, committed, changed: true };
  }

  const skills: Map<string, SkillVersions> = collect({
    base: baseSide.skills,
    ours: ourSide.skills,
    theirs: theirSide.skills,
  });
  const presets: Map<string, PresetVersions> = collect({
    base: baseSide.presets,
    ours: ourSide.presets,
    theirs: theirSide.presets,
  });
  const claimed = new Set<string>([env.metadataName]);
  for (const versions of skills.values()) {
    for (const side of [versions.base, versions.ours, versions.theirs]) {
      if (side) claimed.add(side.path);
    }
  }
  // A skill whose metadata is broken on either side is left exactly as it is here. Its folders
  // stay claimed above, so the whole-entry merge below keeps its hands off them too.
  for (const id of [...ourSide.unreadable, ...theirSide.unreadable]) {
    skills.delete(id);
    env.ctx.log.warn(`Backup merge skipped a skill with unreadable metadata: ${id}`);
  }
  const residual: Map<string, ResidualVersions> = collect(
    { base: baseSide.entries, ours: ourSide.entries, theirs: theirSide.entries },
    (name) => claimed.has(name),
  );
  const plan = planMerge({
    skills,
    presets,
    residual,
    pendingConflicts: new Set(listConflicts(env.ctx.db).map((row) => row.skillKey)),
  });
  const conflicts = plan.skills.filter((item) => item.outcome === "conflict");

  // Nothing of ours to protect: let git move the branch. It refuses when an untracked folder is
  // in the way, and the full merge below then finds the incoming skill another name. Broken remote
  // metadata also goes the long way round, which only ever writes files the plan vouches for.
  let fastForward = false;
  const trustworthy = theirSide.unreadable.size === 0;
  if (base === ours && conflicts.length === 0 && trustworthy) {
    fastForward = (await env.git.probe(["merge", "--ff-only", theirs])).code === 0;
  }
  if (!fastForward) await materialise(env, plan, skills, presets, theirSide, message);

  const newConflicts: string[] = [];
  for (const item of conflicts) {
    const remote = skills.get(item.id)?.theirs;
    const name = item.path ? skillName(env, item.path) : item.id;
    const isNew = recordConflict(env.ctx.db, {
      skillKey: item.id,
      skillName: name,
      theirsCommit: theirs,
      theirsPath: remote?.path ?? null,
    });
    if (isNew) newConflicts.push(name);
  }

  const updated: MergedSkill[] = [];
  for (const item of plan.skills) {
    if (item.outcome !== "updated" || !item.path) continue;
    const remote = skills.get(item.id)?.theirs;
    const paths = [`${env.metadataName}/${SKILL_METADATA_SUBDIR}/${item.id}.json`];
    if (remote) paths.push(remote.path);
    updated.push({
      name: skillName(env, item.path),
      fromDevice: await lastAuthor(env, range, paths),
    });
  }
  const keptLocal = plan.skills
    .filter((item) => item.outcome === "kept_local" && item.path)
    .map((item) => skillName(env, item.path ?? item.id));

  await env.reconcile(true);
  return {
    summary: {
      upToDate: false,
      fastForward,
      updated,
      keptLocal,
      newConflicts,
      pendingTotal: countConflicts(env.ctx.db),
    },
    committed,
    changed: true,
  };
}
