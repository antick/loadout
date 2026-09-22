import type { BatchUpdateResult, PendingRemoval, Skill, UpdateResult } from "@loadout/shared";
import type { CoreContext } from "../context";
import type { RedeployReport } from "../deploy";
import { cancelled, errorMessage, invalid, isAppError, notFound, unsupported } from "../errors";
import type { CancelRegistry, GitClient, InstallIntoLibrary, InstallRecord } from "../install";
import type { SkillPatch, SkillStore } from "../skills/store";
import {
  canonicalPath,
  isDirectory,
  isInside,
  isSkillDir,
  lstatOrNull,
  normalizeAbsolutePath,
  targetIdentity,
} from "../util/fs";
import { hashDir } from "../util/hash";
import { type LockMode, runLocked } from "./locking";
import {
  LIBRARY_LOCATION,
  approvalToken,
  isApproved,
  listRemovedPaths,
  listReplacedEdits,
  sortRemovals,
} from "./removals";
import {
  isRemoteSource,
  openLocalSource,
  openRemoteSource,
  remoteKey,
  remoteTargetOf,
  resolveRemoteRevision,
} from "./source";

export interface UpdaterDeps {
  store: SkillStore;
  git: GitClient;
  cancels: CancelRegistry;
  installIntoLibrary: InstallIntoLibrary;
  refreshCopies(skill: Skill): Promise<RedeployReport>;
}

export interface UpdateOptions {
  lockMode?: LockMode;
}

export interface Updater {
  update(skillId: string, approval?: string | null, options?: UpdateOptions): Promise<UpdateResult>;
  reimport(skillId: string, approval?: string | null): Promise<UpdateResult>;
  relink(skillId: string, sourcePath: string, approval?: string | null): Promise<UpdateResult>;
  detach(skillId: string): Promise<Skill>;
  updateMany(skillIds: string[]): Promise<BatchUpdateResult>;
}

const UPDATE_CANCEL_PREFIX = "update:";
/** Token domain of a re-import: there is no revision, and the path is already on the row. */
const REIMPORT_DOMAIN = "reimport";
const CANNOT_REFRESH = "Source type cannot be refreshed";
const NOT_LOCAL = "Only local and imported skills can do this. Use update for this skill instead.";
const SOURCE_MOVED = "This skill's source changed while it was being updated. Try again.";
const INSIDE_LIBRARY = "That folder is already inside the skill library";
const NO_CHANGES_DETAIL = "No file changes";
const DETACHED_DETAIL = "Detached from its source";

/** Key for `install.cancel(...)` that stops a running update of this skill. */
export function updateCancelKey(skillId: string): string {
  return `${UPDATE_CANCEL_PREFIX}${skillId}`;
}

/** One replacement of a skill's library content, whatever the new content comes from. */
interface Replacement {
  skillId: string;
  /** Folder holding the new content; null when we already know this skill did not change. */
  sourceDir: string | null;
  /** Identity of the replacement inside the approval token. */
  domain: string;
  approval: string | null | undefined;
  lockMode: LockMode;
  /** Throw when the row no longer describes the source the new content was taken from. */
  verify(fresh: Skill): void;
  /** Source fields of the row once the replacement is in. */
  record(fresh: Skill): InstallRecord;
  /** Row changes when the user still has to approve removals; null leaves the row alone. */
  declined(fresh: Skill): SkillPatch | null;
}

function patchFromRecord(record: InstallRecord): SkillPatch {
  return {
    sourceType: record.sourceType,
    sourceRef: record.sourceRef,
    sourceUrl: record.sourceUrl ?? null,
    sourceSubpath: record.sourceSubpath ?? null,
    sourceBranch: record.sourceBranch ?? null,
    sourceRevision: record.sourceRevision ?? null,
    remoteRevision: record.remoteRevision ?? record.sourceRevision ?? null,
    updateStatus: record.updateStatus,
    lastCheckedAt: Date.now(),
    lastCheckError: null,
  };
}

export function createUpdater(ctx: CoreContext, deps: UpdaterDeps): Updater {
  const { store, git, cancels } = deps;
  /** Failures the library installer already wrote to the history. */
  const recordedFailures = new WeakSet<object>();

  function insideLibrary(path: string): boolean {
    return isInside(canonicalPath(ctx.paths.skillsDir), canonicalPath(path));
  }

  function recordFailure(name: string, error: unknown): void {
    if (isAppError(error, "CANCELLED")) return;
    if (typeof error === "object" && error !== null && recordedFailures.has(error)) return;
    ctx.activity.record("update", name, errorMessage(error), false);
  }

  /**
   * Everything the replacement would delete: from the library when its content changes, and from
   * every copy deployment that will be rebuilt. Agents sharing one folder are listed once.
   */
  function pendingRemovals(fresh: Skill, sourceDir: string | null): PendingRemoval[] {
    const removals: PendingRemoval[] = [];
    if (sourceDir) {
      // An edited file the new version drops is listed once, as the edit the user would lose.
      const edits = listReplacedEdits(fresh.libraryPath, sourceDir, fresh.editedFiles);
      const editSet = new Set(edits);
      for (const path of edits) removals.push({ location: LIBRARY_LOCATION, path, kind: "edited" });
      for (const path of listRemovedPaths(fresh.libraryPath, sourceDir)) {
        if (!editSet.has(path))
          removals.push({ location: LIBRARY_LOCATION, path, kind: "removed" });
      }
    }
    const rebuiltFrom = sourceDir ?? fresh.libraryPath;
    const seen = new Set<string>();
    const copies = store
      .deployments()
      .filter((row) => row.skillId === fresh.id && row.mode === "copy")
      .sort((a, b) => (a.agentKey < b.agentKey ? -1 : 1));
    for (const row of copies) {
      // A copy made from the content that stays is not rewritten, so it loses nothing.
      if (!sourceDir && row.sourceHash === fresh.contentHash) continue;
      const identity = targetIdentity(row.targetPath);
      if (seen.has(identity)) continue;
      seen.add(identity);
      // Anything but a real folder is refused by the deploy engine and left untouched.
      if (!lstatOrNull(row.targetPath)?.isDirectory()) continue;
      for (const path of listRemovedPaths(row.targetPath, rebuiltFrom)) {
        removals.push({ location: row.agentKey, path, kind: "removed" });
      }
    }
    return sortRemovals(removals);
  }

  async function installOver(
    fresh: Skill,
    sourceDir: string,
    record: InstallRecord,
  ): Promise<Skill> {
    try {
      return await deps.installIntoLibrary({
        sourceDir,
        // The user may have renamed the skill at install time; an update never renames it back.
        name: fresh.name,
        record: { ...record, replaceSkillId: fresh.id },
        activityKind: "update",
      });
    } catch (error) {
      if (typeof error === "object" && error !== null) recordedFailures.add(error);
      throw error;
    }
  }

  async function replace(plan: Replacement): Promise<UpdateResult> {
    const name = store.get(plan.skillId).name;
    const result = await runLocked(ctx, plan.lockMode, `update ${name}`, async () => {
      const fresh = store.get(plan.skillId);
      plan.verify(fresh);
      const newHash = plan.sourceDir ? hashDir(plan.sourceDir) : fresh.contentHash;
      if (plan.sourceDir && newHash === null) throw invalid("The source has no files to install");
      // Against the stored hash: a commit elsewhere in a big repository changes nothing here.
      const contentChanged = newHash !== fresh.contentHash;
      const changedDir = contentChanged ? plan.sourceDir : null;

      const removals = pendingRemovals(fresh, changedDir);
      if (!isApproved(plan.approval, plan.domain, removals)) {
        const patch = plan.declined(fresh);
        const skill = patch
          ? store.update(fresh.id, { ...patch, updatedAt: fresh.updatedAt })
          : fresh;
        const approval = approvalToken(plan.domain, removals);
        return { skill, contentChanged, pendingRemovals: removals, approval };
      }

      const record = plan.record(fresh);
      let skill: Skill;
      if (changedDir) {
        skill = await installOver(fresh, changedDir, record);
      } else {
        skill = store.update(fresh.id, { ...patchFromRecord(record), updatedAt: fresh.updatedAt });
        ctx.activity.record("update", fresh.name, NO_CHANGES_DETAIL);
      }

      const report = await deps.refreshCopies(skill);
      for (const conflict of report.conflicts) {
        ctx.log.warn(`Deployed copy not refreshed: ${conflict.path} ${conflict.reason}`);
      }
      for (const failure of report.failed) {
        ctx.log.warn(`Deployed copy of ${failure.name} not refreshed: ${failure.message}`);
      }
      return { skill: store.get(skill.id), contentChanged, pendingRemovals: [], approval: null };
    });
    ctx.touched("skills");
    return result;
  }

  function markFailed(skillId: string, error: unknown): void {
    // Neither says anything about the source: the user stopped it, or the library was busy.
    if (isAppError(error, "CANCELLED") || isAppError(error, "BUSY")) return;
    const skill = store.find(skillId);
    if (!skill) return;
    store.update(skillId, {
      updateStatus: "error",
      lastCheckError: errorMessage(error),
      lastCheckedAt: Date.now(),
      updatedAt: skill.updatedAt,
    });
    ctx.touched("skills");
  }

  function requireLocal(skill: Skill): void {
    if (isRemoteSource(skill)) throw unsupported(NOT_LOCAL);
  }

  async function update(
    skillId: string,
    approval?: string | null,
    options: UpdateOptions = {},
  ): Promise<UpdateResult> {
    const skill = store.get(skillId);
    if (!isRemoteSource(skill)) throw unsupported(CANNOT_REFRESH);
    const key = updateCancelKey(skillId);
    const handle = cancels.register(key);
    try {
      ctx.emit("install:progress", { key, phase: "cloning", name: skill.name });
      const target = remoteTargetOf(skill);
      const revision = await resolveRemoteRevision(git, target, handle.signal);
      // Same commit as installed: nothing to download, only the row to settle.
      const source =
        revision === skill.sourceRevision
          ? null
          : await openRemoteSource(git, target, revision, handle.signal);
      try {
        if (handle.signal.aborted) throw cancelled();
        ctx.emit("install:progress", { key, phase: "installing", name: skill.name });
        return await replace({
          skillId,
          sourceDir: source?.dir ?? null,
          domain: revision,
          approval,
          lockMode: options.lockMode ?? "wait",
          verify: (fresh) => {
            const still = isRemoteSource(fresh) && remoteKey(remoteTargetOf(fresh));
            if (still !== remoteKey(target)) throw invalid(SOURCE_MOVED);
          },
          record: (fresh) => ({
            sourceType: fresh.sourceType,
            sourceRef: fresh.sourceRef,
            sourceUrl: fresh.sourceUrl ?? target.url,
            sourceSubpath: source ? source.subpath : fresh.sourceSubpath,
            sourceBranch: fresh.sourceBranch,
            sourceRevision: revision,
            remoteRevision: revision,
            updateStatus: "up_to_date",
          }),
          declined: () => ({
            remoteRevision: revision,
            updateStatus: "update_available",
            lastCheckedAt: Date.now(),
            lastCheckError: null,
          }),
        });
      } finally {
        await source?.cleanup();
      }
    } catch (error) {
      recordFailure(skill.name, error);
      markFailed(skillId, error);
      throw error;
    } finally {
      handle.done();
    }
  }

  async function reimport(skillId: string, approval?: string | null): Promise<UpdateResult> {
    const skill = store.get(skillId);
    requireLocal(skill);
    try {
      const source = await openLocalSource(skill);
      try {
        return await replace({
          skillId,
          // An adopted skill's source is its own library folder: there is nothing to copy.
          sourceDir: insideLibrary(source.dir) ? null : source.dir,
          domain: REIMPORT_DOMAIN,
          approval,
          lockMode: "wait",
          verify: (fresh) => {
            if (fresh.sourceRef !== skill.sourceRef) throw invalid(SOURCE_MOVED);
          },
          record: (fresh) => ({
            sourceType: fresh.sourceType,
            sourceRef: fresh.sourceRef,
            updateStatus: "local_only",
          }),
          declined: () => null,
        });
      } finally {
        await source.cleanup();
      }
    } catch (error) {
      recordFailure(skill.name, error);
      if (isAppError(error, "NOT_FOUND") && store.find(skillId)) {
        store.update(skillId, {
          updateStatus: "source_missing",
          lastCheckError: errorMessage(error),
          lastCheckedAt: Date.now(),
          updatedAt: skill.updatedAt,
        });
        ctx.touched("skills");
      }
      throw error;
    }
  }

  async function relink(
    skillId: string,
    sourcePath: string,
    approval?: string | null,
  ): Promise<UpdateResult> {
    const skill = store.get(skillId);
    requireLocal(skill);
    const path = normalizeAbsolutePath(sourcePath, "Source path");
    if (!isDirectory(path)) throw notFound(`Folder not found: ${path}`);
    if (!isSkillDir(path)) throw invalid(`No SKILL.md found in ${path}`);
    if (insideLibrary(path)) throw invalid(INSIDE_LIBRARY);
    try {
      return await replace({
        skillId,
        sourceDir: path,
        domain: path,
        approval,
        lockMode: "wait",
        verify: requireLocal,
        record: () => ({ sourceType: "local", sourceRef: path, updateStatus: "local_only" }),
        declined: () => null,
      });
    } catch (error) {
      recordFailure(skill.name, error);
      throw error;
    }
  }

  async function detach(skillId: string): Promise<Skill> {
    const detached = await ctx.lock.run(`detach ${store.get(skillId).name}`, () =>
      store.update(skillId, {
        sourceType: "local",
        sourceRef: null,
        sourceUrl: null,
        sourceSubpath: null,
        sourceBranch: null,
        sourceRevision: null,
        remoteRevision: null,
        updateStatus: "local_only",
        lastCheckError: null,
      }),
    );
    ctx.activity.record("update", detached.name, DETACHED_DETAIL);
    ctx.touched("skills");
    return detached;
  }

  async function updateMany(skillIds: string[]): Promise<BatchUpdateResult> {
    const result: BatchUpdateResult = { updated: 0, unchanged: 0, heldBack: [], failed: [] };
    for (const skillId of skillIds) {
      const skill = store.find(skillId);
      try {
        if (!skill) throw notFound(`Skill not found: ${skillId}`);
        if (!isRemoteSource(skill) && !skill.sourceRef) throw unsupported(CANNOT_REFRESH);
        // A batch never approves removals: those skills wait for the user to look at the list.
        const outcome = isRemoteSource(skill) ? await update(skillId) : await reimport(skillId);
        if (outcome.pendingRemovals.length > 0) result.heldBack.push(skill.name);
        else if (outcome.contentChanged) result.updated += 1;
        else result.unchanged += 1;
      } catch (error) {
        result.failed.push({ name: skill?.name ?? skillId, message: errorMessage(error) });
      }
    }
    return result;
  }

  return { update, reimport, relink, detach, updateMany };
}
