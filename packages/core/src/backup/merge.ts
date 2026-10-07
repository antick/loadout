import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type MergeSummary,
  type MergedSkill,
  type SyncReviewAnswer,
  firstFreeName,
} from "@loadout/shared";
import { AppError } from "../errors";
import { readSkillIdentity } from "../skills/metadata";
import { LIBRARY_PLACE, type LibraryRecord, libraryRecordOf } from "../storage/removed-library";
import { ensureDir, isSkillDir, removePath, writeFileAtomic } from "../util/fs";
import { assertReadable, schemaAt } from "./compat";
import { recordConflict } from "./conflict-store";
import { type BackupEnv, PRESET_METADATA_SUBDIR, SKILL_METADATA_SUBDIR } from "./env";
import { metadataFileName } from "../skills/portable-format";
import { STAGE_MOVES_DIR, type Stage, createStage, extractPaths } from "./extract";
import { gitError } from "./git";
import {
  type SetAsideFolder,
  leftOutInTheWay,
  localFilesNotKept,
  setAsideFolder,
  settleSetAside,
} from "./ignored";
import {
  type MergeSides,
  type RangeAuthors,
  assertDeletesReviewed,
  authorsIn,
  assertFoldersReviewed,
  departingFolders,
  planSides,
  readSides,
  skillFoldersHere,
} from "./merge-input";
import type { MergePlan, PresetVersions, SkillPlan, SkillVersions } from "./merge-plan";
import { startLibraryEdit } from "./interrupted";
import { type CommitSnapshot, isPlainEntryName } from "./merge-read";
import { commitStaged, mergeBase, requireBranch, resolveCommit, upstreamCommit } from "./repo";

/**
 * Brings the remote branch into the library. The decision is made per skill (see
 * `merge-plan.ts`) and written as a real two-parent merge commit, so plain git commands still see
 * ordinary history. A content conflict never stops the merge: our version stays on disk and the
 * remote one is remembered for the user to choose later. Only a remote without our metadata gets
 * git's line merge instead.
 */

const BEFORE_MERGE_MESSAGE = "backup: before merge";
const MERGE_MESSAGE_PREFIX = "merge: sync from ";
const UNKNOWN_DEVICE = "another device";

export interface MergeResult {
  summary: MergeSummary;
  /** Local changes had to be committed before merging. */
  committed: boolean;
  /** The library now holds something it did not hold before. */
  changed: boolean;
  /** The remote-tracking commit merged from; null when there is none yet. */
  upstream: string | null;
}

const UP_TO_DATE: MergeSummary = {
  upToDate: true,
  updated: [],
  keptLocal: [],
  removed: [],
  newConflicts: [],
};

function skillName(env: BackupEnv, path: string): string {
  return readSkillIdentity(join(env.repoDir, path)).name;
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

/**
 * A skill the merge took out: into Recently removed, with its tags and presets when known.
 * False when that failed: the folder then stays where it was set aside.
 */
function keepDeparted(env: BackupEnv, aside: SetAsideFolder, record?: LibraryRecord): boolean {
  try {
    env.removed.setAside(aside.to, {
      place: LIBRARY_PLACE,
      reason: "deleted_elsewhere",
      originalPath: aside.from,
      ...(record ? { library: record } : {}),
    });
    return true;
  } catch (error) {
    env.ctx.log.error(
      `Could not keep ${aside.from} in Recently removed; left in ${aside.to}`,
      error,
    );
    return false;
  }
}

/**
 * Put the planned library on disk and commit it as a merge of `theirs`. Returns where files
 * that could be kept nowhere else wait on disk (a folder of the stage); null otherwise.
 */
async function materialise(
  env: BackupEnv,
  plan: MergePlan,
  skills: Map<string, SkillVersions>,
  presets: Map<string, PresetVersions>,
  theirs: CommitSnapshot,
  message: string,
  /** Library records of the skills this merge takes out, for Recently removed. */
  departing: ReadonlyMap<string, LibraryRecord>,
): Promise<string | null> {
  const stage: Stage = createStage(env);
  // Every folder moved in or out before the commit is journaled, so a crash can be undone.
  const edit = startLibraryEdit(env, await env.git.text(["rev-parse", "HEAD"]));
  edit.addStage(stage.dir);
  // Folders of ours that the merge replaces or drops, set aside with their left-out files.
  const asides = new Map<string, SetAsideFolder>();
  const planned = new Set(plan.skills.flatMap((item) => (item.path ? [item.path] : [])));
  const move = (from: string, to: string): void => edit.move(from, to);
  const place = (item: SkillPlan, from: string): void => {
    if (!item.path || !existsSync(from)) return;
    const folder = freeFolder(env, item.path, planned);
    if (folder !== item.path) {
      planned.add(folder);
      item.path = folder;
      if (item.meta) item.meta = { ...item.meta, path: folder };
    }
    move(from, join(env.repoDir, folder));
  };

  // Set when files could be kept nowhere else: the stage then stays on disk.
  let leftIn: string | null = null;
  try {
    await placeAndCommit();
    // Committed: the left-out files of replaced folders move into their successors, and skills
    // another device deleted go to Recently removed.
    for (const item of plan.skills) {
      const aside = asides.get(item.id);
      if (!aside) continue;
      if (item.content === "none" && !keepDeparted(env, aside, departing.get(item.id))) {
        leftIn ??= aside.to;
      }
      if (item.content !== "theirs" || !item.path) continue;
      if (!settleSetAside(env, aside, join(env.repoDir, item.path))) leftIn ??= aside.to;
    }
  } finally {
    if (!leftIn) await stage.cleanup();
  }
  return leftIn;

  async function placeAndCommit(): Promise<void> {
    try {
      await writeMerge();
    } catch (error) {
      // Back to our last commit: every folder moved goes back where it was, as after a crash,
      // then git restores the rest. One that could not go back is still in the stage: keep it.
      if (!edit.undo()) {
        leftIn = stage.dir;
        env.ctx.log.error(
          `A failed backup merge could not put every folder back; see ${stage.dir}`,
        );
      }
      await env.git.probe(["reset", "--hard", "HEAD"]);
      throw error;
    }
  }

  async function writeMerge(): Promise<void> {
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
      if (item.content !== "ours") {
        const aside = await setAsideFolder(env, stage, ours.path, item.id, move);
        if (aside) asides.set(item.id, aside);
      } else if (item.path !== ours.path) movers.push(item);
    }
    // Two steps, so that skills swapping folder names do not trip over each other.
    ensureDir(stage.pathOf(STAGE_MOVES_DIR));
    for (const item of movers) {
      const from = join(env.repoDir, skills.get(item.id)?.ours?.path ?? "");
      if (existsSync(from)) move(from, stage.pathOf(join(STAGE_MOVES_DIR, item.id)));
    }
    for (const item of movers) place(item, stage.pathOf(join(STAGE_MOVES_DIR, item.id)));
    for (const item of incoming) {
      place(item, stage.pathOf(skills.get(item.id)?.theirs?.path ?? item.id));
    }

    for (const entry of plan.residual) {
      // Read from another device's commit: only ever a direct child of the repository.
      if (!isPlainEntryName(entry.name)) continue;
      await removePath(join(env.repoDir, entry.name));
      if (entry.action === "checkout") {
        await env.git.run(["checkout", theirs.commit, "--", entry.name], {
          globalArgs: ["--literal-pathspecs"],
        });
      }
    }

    const metadataDir = env.ctx.paths.metadataDir;
    for (const item of plan.skills) {
      const file = join(metadataDir, SKILL_METADATA_SUBDIR, metadataFileName(item.id));
      if (item.meta) writeIfChanged(file, `${JSON.stringify(item.meta, null, 2)}\n`);
      // Only a skill we really had is removed; an unreadable file of ours is left for the user.
      else if (skills.get(item.id)?.ours) await removePath(file);
    }
    for (const item of plan.presets) {
      if (item.take !== "theirs") continue;
      const file = join(metadataDir, PRESET_METADATA_SUBDIR, metadataFileName(item.id));
      const raw = presets.get(item.id)?.theirs?.raw;
      if (raw === undefined) await removePath(file);
      else writeIfChanged(file, raw);
    }

    await env.git.run(["add", "-A"]);
    await env.git.run(["commit", "-q", "-m", message]);
  }
}

/** Line-based `git merge`, for a remote without our metadata (filled by hand, or by an older app). */
async function plainMerge(env: BackupEnv, theirs: string, message: string): Promise<void> {
  // Git would overwrite a left-out file the remote has a file at without asking: refuse instead.
  const inTheWay = await leftOutInTheWay(env, theirs);
  if (inTheWay.length > 0) {
    throw new AppError(
      "GIT",
      `The backup remote has files where this library keeps files left out of the backup, and syncing would overwrite them: ${inTheWay.join(", ")}. Move them out of the library folder, sync again, then put back what you still need.`,
      { paths: inTheWay },
    );
  }
  const result = await env.git.probe(["merge", "--no-edit", "-m", message, theirs]);
  if (result.code === 0) return;
  await env.git.probe(["merge", "--abort"]);
  const output = `${result.stderr}\n${result.stdout}`;
  if (/conflict/i.test(output)) {
    throw new AppError(
      "SYNC_CONFLICT",
      "The same files were changed on two devices and Git could not merge them line by line. The backup remote lacks Loadout's skill details, so skills cannot be merged one by one. Restore the library from the backup remote, or resolve it in a terminal.",
      { detail: gitError(output).details?.detail },
    );
  }
  throw gitError(output);
}

/**
 * `plainMerge` with the protection the skill-aware merge gives skills another device deleted:
 * many stop the sync until reviewed, and each is kept in Recently removed. Returns those skills.
 */
async function lineMerge(
  env: BackupEnv,
  sides: MergeSides,
  authors: RangeAuthors,
  message: string,
  review: SyncReviewAnswer | undefined,
): Promise<MergedSkill[]> {
  const theirs = sides.theirs.commit;
  const departing = departingFolders(env, sides).map((folder) => {
    const path = join(env.repoDir, folder);
    return { folder, path, row: env.store.findByLibraryPath(path) };
  });
  assertFoldersReviewed(
    departing.map(({ folder, row }) => row?.name ?? folder),
    skillFoldersHere(env, sides),
    theirs,
    review,
  );
  const kept: string[] = [];
  const removed: MergedSkill[] = [];
  try {
    // Copies made before git deletes the folders, so they hold the left-out files as well.
    for (const { folder, path, row } of departing) {
      const id = env.removed.keepCopy(path, {
        place: LIBRARY_PLACE,
        reason: "deleted_elsewhere",
        ...(row ? { library: libraryRecordOf(row) } : {}),
      });
      if (id) kept.push(id);
      removed.push({
        name: row?.name ?? folder,
        fromDevice: authors.of(row?.id ?? null, folder) ?? UNKNOWN_DEVICE,
      });
    }
    await plainMerge(env, theirs, message);
  } catch (error) {
    for (const id of kept) env.removed.remove(id);
    throw error;
  }
  // Git leaves the left-out files behind in a folder it deletes; the copy holds them now.
  for (const { path } of departing) if (!isSkillDir(path)) await removePath(path);
  return removed;
}

/** Skills whose folder differs between two commits, for merges made without a plan. */
async function changedSkills(
  env: BackupEnv,
  from: string,
  authors: RangeAuthors,
): Promise<MergedSkill[]> {
  const diff = await env.git.run(["diff", "--name-only", "-z", from, "HEAD"]);
  const folders = new Set<string>();
  for (const path of diff.stdout.split("\0")) {
    const top = path.split("/")[0] ?? "";
    if (top && !top.startsWith(".") && existsSync(join(env.repoDir, top))) folders.add(top);
  }
  return [...folders].sort().map((folder) => ({
    name: skillName(env, folder),
    fromDevice: authors.of(null, folder) ?? UNKNOWN_DEVICE,
  }));
}

/**
 * Merge `origin/<branch>` as last fetched. Must run inside the library lock, through
 * `whileMerging`, after the ignore file was refreshed; does no network. Pending local changes
 * are committed first so the merge always starts from a clean folder.
 */
export async function mergeRemote(env: BackupEnv, review?: SyncReviewAnswer): Promise<MergeResult> {
  env.portable.write();
  const committed = await commitStaged(env, BEFORE_MERGE_MESSAGE);
  const branch = await requireBranch(env);
  const ours = await resolveCommit(env, "HEAD");
  const theirs = await upstreamCommit(env, branch);
  if (theirs) assertReadable(await schemaAt(env, theirs));
  const idle = (): MergeResult => ({
    summary: UP_TO_DATE,
    committed,
    changed: false,
    upstream: theirs,
  });
  if (!ours || !theirs || ours === theirs) return idle();

  const base = await mergeBase(env, ours, theirs);
  if (base === theirs) return idle();

  // One look at the incoming commits answers who sent them and who last touched each skill.
  const authors = await authorsIn(env, `${base}..${theirs}`);
  const message = `${MERGE_MESSAGE_PREFIX}${authors.all.join(", ") || UNKNOWN_DEVICE}`;

  const sides = await readSides(env, base, ours, theirs);
  const theirSide = sides.theirs;

  // Without our metadata on both sides every skill would read as deleted: git's line merge then.
  if (!sides.describable) {
    const removed = await lineMerge(env, sides, authors, message, review);
    const summary: MergeSummary = {
      ...UP_TO_DATE,
      upToDate: false,
      updated: await changedSkills(env, ours, authors),
      removed,
    };
    await env.reconcile("authoritative");
    return { summary, committed, changed: true, upstream: theirs };
  }

  const planned = planSides(env, sides, new Set(review?.keep ?? []));
  const { skills, presets, plan } = planned;
  assertDeletesReviewed(planned, (id) => env.store.nameOf(id) ?? id, theirs, review);
  const conflicts = plan.skills.filter((item) => item.outcome === "conflict");

  // Nothing of ours to protect: let git move the branch. It refuses when an untracked folder is
  // in the way, and the full merge below then finds the incoming skill another name. Broken remote
  // metadata also goes the long way round, which only ever writes files the plan vouches for.
  let fastForward = false;
  const trustworthy = theirSide.unreadable.size === 0 && theirSide.unreadablePresets.size === 0;
  // Git leaves files kept out of the backup behind in a folder it deletes or renames. The full
  // merge sets such folders aside instead and moves those files along.
  const reshapesOurs = plan.skills.some((item) => {
    const mine = skills.get(item.id)?.ours;
    return mine !== undefined && (item.content === "none" || item.path !== mine.path);
  });
  if (base === ours && conflicts.length === 0 && trustworthy && !reshapesOurs) {
    // Refused where the incoming side has a file at a left-out file's path: git would overwrite
    // it. The full merge then keeps that file.
    const result = await env.git.probe(["merge", "--ff-only", "--no-overwrite-ignore", theirs]);
    fastForward = result.code === 0;
  }
  // Read before the merge: afterwards the folders are gone and the rebuild drops the rows.
  const departing = new Map<string, LibraryRecord>();
  const removed: MergedSkill[] = [];
  for (const item of plan.skills) {
    const mine = skills.get(item.id)?.ours;
    if (item.outcome !== "deleted" || !mine) continue;
    const row = env.store.find(item.id);
    if (row) departing.set(item.id, libraryRecordOf(row));
    removed.push({
      name: row?.name ?? mine.path,
      fromDevice: authors.of(item.id, mine.path) ?? UNKNOWN_DEVICE,
    });
  }
  const leftIn = fastForward
    ? null
    : await materialise(env, plan, skills, presets, theirSide, message, departing);

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
    updated.push({
      name: skillName(env, item.path),
      fromDevice: authors.of(item.id, skills.get(item.id)?.theirs?.path) ?? UNKNOWN_DEVICE,
    });
  }
  const keptLocal = plan.skills
    .filter((item) => item.outcome === "kept_local" && item.path)
    .map((item) => skillName(env, item.path ?? item.id));

  await env.reconcile("authoritative");
  // The merge is committed and the library indexed; only those files still need the user.
  if (leftIn) throw localFilesNotKept(leftIn);
  return {
    summary: {
      upToDate: false,
      updated,
      keptLocal,
      removed,
      newConflicts,
    },
    committed,
    changed: true,
    upstream: theirs,
  };
}
