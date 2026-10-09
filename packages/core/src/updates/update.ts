import {
  type BatchUpdateResult,
  type ErrorCode,
  type SafetyReport,
  type Skill,
  type UpdateManyOptions,
  type UpdateResult,
  updateProgressKey,
  REMOVAL_IN_LIBRARY,
  isRemoteSource,
} from "@loadout/shared";

import type { CoreContext } from "../context";
import type { ClawhubClient } from "../market/clawhub";
import type { RedeployReport } from "../deploy";
import { AppError, cancelled, errorMessage, invalid, isAppError, unsupported } from "../errors";

import type {
  CancelRegistry,
  Download,
  GitClient,
  InstallIntoLibrary,
  InstallRecord,
} from "../install";
import { INSIDE_LIBRARY, sourceFieldsOf } from "../install/library";
import { requireSkillFolder } from "../install/read-skill";
import type { SafetyGate } from "../install/safety-gate";
import { hashAsLibraryCopy } from "../skills/numbered-name";

import type { RemovedStore } from "../storage/removed";
import { LIBRARY_PLACE } from "@loadout/shared";

import type { SkillPatch, SkillStore } from "../skills/store";
import { sourceGuard } from "./check";
import { detachSkill } from "./detach";

import { type LockMode, runLocked } from "./locking";

import { assessReplacement } from "./pending";

import { diffWithSource } from "./preview";

import { approvalToken, isApproved } from "./removals";

import {
  type OpenedSource,
  openLocalSource,
  openRemoteSource,
  remoteKey,
  remoteTargetOf,
  resolveRemoteRevision,
} from "./source";

import { logRedeployProblems } from "../deploy/report-log";

import { CANNOT_REFRESH, FLAGGED_UPDATE, updateEach } from "./update-many";

import { isReallyInside } from "../util/safe-path";

export interface UpdaterDeps {
  store: SkillStore;
  git: GitClient;
  download: Download;
  cancels: CancelRegistry;
  installIntoLibrary: InstallIntoLibrary;
  refreshCopies(skill: Skill): Promise<RedeployReport>;
  /** The same safety check installs get. */
  safety: SafetyGate;
  /** Keeps the edited version an approved update replaces. */
  removed: Pick<RemovedStore, "keepCopy">;
  /** The registry client, for ClawHub skills. */
  clawhub: ClawhubClient;
}

export interface UpdateOptions {
  lockMode?: LockMode;
  /** Apply a new version the safety check flagged. Only ever on the user's word. */
  acceptRisk?: boolean;
  /**
   * The upstream revision the user compared against. When upstream has moved on since, nothing
   * is installed: the user never saw what the newer revision changes.
   */
  expectedRevision?: string | null;
  /** The upstream revision a check found moments ago: installed without asking the remote. */
  knownRevision?: string | null;
  /** Only say what it would hold back: see `RefreshOptions.dryRun`. */
  dryRun?: boolean;
  /**
   * Take whatever files the new version removes, whatever the list: a batch the user approved
   * as a whole. Saves downloading each skill twice, once for the list and once for its token.
   */
  approveRemovals?: boolean;
}

export interface Updater {
  update(skillId: string, approval?: string | null, options?: UpdateOptions): Promise<UpdateResult>;
  reimport(
    skillId: string,
    approval?: string | null,
    options?: UpdateOptions,
  ): Promise<UpdateResult>;
  relink(
    skillId: string,
    sourcePath: string,
    approval?: string | null,
    options?: UpdateOptions,
  ): Promise<UpdateResult>;
  detach(skillId: string, options?: { markAuthored?: boolean }): Promise<Skill>;
  updateMany(skillIds: string[], options?: UpdateManyOptions): Promise<BatchUpdateResult>;
}

/** Token domain of a re-import: there is no revision, and the path is already on the row. */
const REIMPORT_DOMAIN = "reimport";
const NOT_LOCAL =
  "Only local, imported and linked skills can do this. Use update for this skill instead.";
const SOURCE_MOVED = "This skill's source changed while it was being updated. Try again.";
const NO_CHANGES_DETAIL = "No file changes";
const MOVED_SINCE_COMPARED =
  "The source changed again since you compared it. Look at Compare again, then update.";

/** One replacement of a skill's library content, whatever the new content comes from. */
interface Replacement {
  skillId: string;
  /** Folder holding the new content; null when we already know this skill did not change. */
  sourceDir: string | null;
  /** Identity of the replacement inside the approval token. */
  domain: string;
  approval: string | null | undefined;
  /** Take whatever the new version removes, without a token: see `UpdateOptions`. */
  approveRemovals?: boolean;
  lockMode: LockMode;
  acceptRisk?: boolean;
  /** Work out the removals and stop: nothing is written. */
  dryRun?: boolean;
  /** What a dry run compares the library with; there even when `sourceDir` is null. */
  preview?: OpenedSource | null;
  /** Throw when the row no longer describes the source the new content was taken from. */
  verify(fresh: Skill): void;
  /** Source fields of the row once the replacement is in. */
  record(fresh: Skill): InstallRecord;
  /** Row changes when the user still has to approve removals; null leaves the row alone. */
  declined(fresh: Skill): SkillPatch | null;
}

function patchFromRecord(record: InstallRecord): SkillPatch {
  return {
    ...sourceFieldsOf(record),
    updateStatus: record.updateStatus,
    lastCheckedAt: Date.now(),
    lastCheckError: null,
  };
}

function requireLocal(skill: Skill): void {
  if (isRemoteSource(skill)) throw unsupported(NOT_LOCAL);
}

export function createUpdater(ctx: CoreContext, deps: UpdaterDeps): Updater {
  const { store, git, download, cancels } = deps;
  const clients = { git, clawhub: deps.clawhub };

  const insideLibrary = (path: string): boolean => isReallyInside(ctx.paths.skillsDir, path);

  function recordFailure(name: string, error: unknown): void {
    if (isAppError(error, "CANCELLED")) return;
    ctx.activity.record("update", name, errorMessage(error), false);
  }

  async function installOver(
    fresh: Skill,
    sourceDir: string,
    record: InstallRecord,
  ): Promise<Skill> {
    return deps.installIntoLibrary({
      sourceDir,
      // The user may have renamed the skill at install time; an update never renames it back.
      name: fresh.name,
      record: { ...record, replaceSkillId: fresh.id },
      activityKind: "update",
      // The caller writes the failure once, with every other way an update can fail.
      recordFailure: false,
    });
  }

  /**
   * The safety check of the new version, before the library lock and before anything is
   * written, like an install. Throws UNSAFE when it is flagged and the user did not accept that.
   */
  async function checkNewVersion(plan: Replacement): Promise<SafetyReport | null> {
    const current = store.get(plan.skillId);
    if (!plan.sourceDir) return null;
    const newHash = hashAsLibraryCopy(plan.sourceDir, current.dirName, {}, current.name);
    if (newHash === current.contentHash) return null;
    const [report] = await deps.safety.check([{ name: current.name, dir: plan.sourceDir }], {
      acceptRisk: plan.acceptRisk,
      progressKey: updateProgressKey(plan.skillId),
    });
    return report ?? null;
  }

  async function replace(plan: Replacement): Promise<UpdateResult> {
    if (plan.dryRun) {
      // Reads only: no lock, nothing written. The safety check reads too, and refuses as the
      // real update would.
      await checkNewVersion(plan);
      const fresh = store.get(plan.skillId);
      plan.verify(fresh);
      const { contentChanged, removals } = assessReplacement(store, fresh, plan.sourceDir);
      return {
        skill: fresh,
        contentChanged,
        pendingRemovals: removals,
        approval: null,
        removedIds: [],
        sourceDiff: plan.preview
          ? diffWithSource(fresh, plan.preview, { asLibraryCopy: true })
          : null,
      };
    }
    const safetyReport = await checkNewVersion(plan);
    const name = store.get(plan.skillId).name;
    const result = await runLocked(ctx, plan.lockMode, `update ${name}`, async () => {
      const fresh = store.get(plan.skillId);
      plan.verify(fresh);
      const { contentChanged, changedDir, removals } = assessReplacement(
        store,
        fresh,
        plan.sourceDir,
      );
      if (!plan.approveRemovals && !isApproved(plan.approval, plan.domain, removals)) {
        const patch = plan.declined(fresh);
        const skill = patch ? store.update(fresh.id, patch) : fresh;
        const approval = approvalToken(plan.domain, removals);
        return {
          skill,
          contentChanged,
          pendingRemovals: removals,
          approval,
          removedIds: [],
          sourceDiff: null,
        };
      }

      const record = plan.record(fresh);
      // The user agreed to lose edits: their version still waits in Recently removed.
      const replacesEdits = removals.some(
        (removal) => removal.location === REMOVAL_IN_LIBRARY && removal.kind === "edited",
      );
      const kept =
        changedDir && replacesEdits
          ? deps.removed.keepCopy(fresh.libraryPath, { place: LIBRARY_PLACE, reason: "replaced" })
          : null;
      let skill: Skill;
      if (changedDir) {
        skill = await installOver(fresh, changedDir, record);
        deps.safety.remember(skill, safetyReport);
      } else {
        skill = store.update(fresh.id, patchFromRecord(record));
        ctx.activity.record("update", fresh.name, NO_CHANGES_DETAIL);
      }

      const report = await deps.refreshCopies(skill);
      logRedeployProblems(ctx.log, report, "refresh");
      return {
        skill: store.get(skill.id),
        contentChanged,
        pendingRemovals: [],
        approval: null,
        removedIds: kept ? [kept] : [],
        sourceDiff: null,
      };
    });
    ctx.touched("skills");
    return result;
  }

  /**
   * Record that updating `skill` failed. Inside the library lock, and only while the skill still
   * points at the source that failed: one detached or relinked meanwhile is not marked. Skipped
   * when the library is busy; the next check says the same.
   */
  async function markFailed(skill: Skill, error: unknown): Promise<void> {
    // None says anything is wrong with the source: the user stopped it, the library was busy,
    // or upstream simply moved on since the user compared.
    const quiet: readonly ErrorCode[] = ["CANCELLED", "BUSY", "CHANGED_ON_DISK"];
    if (quiet.some((code) => isAppError(error, code))) return;
    const patch: SkillPatch = isAppError(error, "UNSAFE")
      ? // Nothing is wrong with the source: a new version is there, and it waits for the user.
        { updateStatus: "update_available", lastCheckError: FLAGGED_UPDATE }
      : {
          // The source answered, and the skill is not in it any more: not a failure to retry.
          updateStatus: isAppError(error, "NOT_FOUND") ? "source_missing" : "error",
          lastCheckError: errorMessage(error),
        };
    const marked = await ctx.lock.tryRun(`mark ${skill.name} failed`, () => {
      const fresh = store.find(skill.id);
      if (!fresh || sourceGuard(fresh) !== sourceGuard(skill)) return false;
      store.patch(skill.id, { ...patch, lastCheckedAt: Date.now() });
      return true;
    });
    if (marked) ctx.touched("updates");
  }

  /** Whatever happened, the status bar must stop saying "Cloning…" or "Checking…" for it. */
  function progressDone(skill: Skill): void {
    ctx.emit("install:progress", {
      key: updateProgressKey(skill.id),
      phase: "done",
      name: skill.name,
    });
  }

  async function update(
    skillId: string,
    approval?: string | null,
    options: UpdateOptions = {},
  ): Promise<UpdateResult> {
    const skill = store.get(skillId);
    if (!isRemoteSource(skill)) {
      // A folder, archive or archive link gives its new version by being imported again.
      if (!skill.sourceRef) throw unsupported(CANNOT_REFRESH);
      return reimport(skillId, approval, options);
    }
    const key = updateProgressKey(skillId);
    const handle = cancels.register(key);
    try {
      ctx.emit("install:progress", { key, phase: "cloning", name: skill.name });
      const target = remoteTargetOf(skill);
      const revision =
        options.knownRevision ?? (await resolveRemoteRevision(clients, target, handle.signal));
      if (options.expectedRevision && revision !== options.expectedRevision) {
        throw new AppError("CHANGED_ON_DISK", MOVED_SINCE_COMPARED);
      }
      // Same commit as installed: nothing to download, only the row to settle. A dry run still
      // fetches it once, for the comparison it hands back.
      const same = revision === skill.sourceRevision;
      const source =
        same && !options.dryRun
          ? null
          : await openRemoteSource(clients, target, revision, handle.signal);
      try {
        if (handle.signal.aborted) throw cancelled();
        ctx.emit("install:progress", { key, phase: "installing", name: skill.name });
        return await replace({
          skillId,
          sourceDir: same ? null : (source?.dir ?? null),
          domain: revision,
          approval,
          approveRemovals: options.approveRemovals,
          lockMode: options.lockMode ?? "wait",
          acceptRisk: options.acceptRisk,
          dryRun: options.dryRun,
          preview: source,
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
          // Nothing new upstream: only a stale copy would lose files, and the row says so.
          declined: () => ({
            remoteRevision: revision,
            updateStatus: same ? "up_to_date" : "update_available",
            lastCheckedAt: Date.now(),
            lastCheckError: null,
          }),
        });
      } finally {
        await source?.cleanup();
      }
    } catch (error) {
      // A dry run writes nothing, not even that it failed.
      if (!options.dryRun) {
        recordFailure(skill.name, error);
        await markFailed(skill, error);
      }
      throw error;
    } finally {
      handle.done();
      progressDone(skill);
    }
  }

  async function reimport(
    skillId: string,
    approval?: string | null,
    options: UpdateOptions = {},
  ): Promise<UpdateResult> {
    const skill = store.get(skillId);
    requireLocal(skill);
    try {
      const source = await openLocalSource(skill, download);
      try {
        return await replace({
          skillId,
          // An adopted skill's source is its own library folder: there is nothing to copy.
          sourceDir: insideLibrary(source.dir) ? null : source.dir,
          domain: REIMPORT_DOMAIN,
          approval,
          approveRemovals: options.approveRemovals,
          lockMode: options.lockMode ?? "wait",
          acceptRisk: options.acceptRisk,
          dryRun: options.dryRun,
          preview: source,
          verify: (fresh) => {
            if (fresh.sourceRef !== skill.sourceRef) throw invalid(SOURCE_MOVED);
          },
          record: (fresh) => ({
            sourceType: fresh.sourceType,
            sourceRef: fresh.sourceRef,
            sourceUrl: fresh.sourceUrl,
            // Which of several skills in an archive this one is.
            sourceSubpath: fresh.sourceSubpath,
            updateStatus: fresh.sourceType === "url" ? "up_to_date" : "local_only",
          }),
          declined: () => null,
        });
      } finally {
        await source.cleanup();
      }
    } catch (error) {
      if (options.dryRun) throw error;
      recordFailure(skill.name, error);
      await markFailed(skill, error);
      throw error;
    } finally {
      // Its safety check reported under the skill's update key.
      progressDone(skill);
    }
  }

  async function relink(
    skillId: string,
    sourcePath: string,
    approval?: string | null,
    options: UpdateOptions = {},
  ): Promise<UpdateResult> {
    const skill = store.get(skillId);
    requireLocal(skill);
    const path = requireSkillFolder(sourcePath);
    if (insideLibrary(path)) throw invalid(INSIDE_LIBRARY);
    try {
      return await replace({
        skillId,
        sourceDir: path,
        domain: path,
        approval,
        lockMode: "wait",
        acceptRisk: options.acceptRisk,
        verify: requireLocal,
        record: () => ({ sourceType: "local", sourceRef: path, updateStatus: "local_only" }),
        declined: () => null,
      });
    } catch (error) {
      recordFailure(skill.name, error);
      await markFailed(skill, error);
      throw error;
    } finally {
      progressDone(skill);
    }
  }

  return {
    update,
    reimport,
    relink,
    detach: (skillId, options) => detachSkill(ctx, store, skillId, options),
    updateMany: (skillIds, options) =>
      updateEach(
        store,
        (skillId, knownRevision, approveRemovals) =>
          update(skillId, null, { knownRevision, approveRemovals }),
        skillIds,
        options,
      ),
  };
}
