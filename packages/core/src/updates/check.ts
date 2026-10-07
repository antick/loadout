import {
  type CheckAllOptions,
  type CheckAllResult,
  type Skill,
  UPDATE_CHECK_FRESH_MS,
  type UpdateStatus,
  isRemoteSource,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import type { ClawhubClient } from "../market/clawhub";
import { errorMessage, isAppError } from "../errors";
import type { Download, GitClient } from "../install";
import { hashAsLibraryCopy, sameTextAsLibraryCopy } from "../skills/numbered-name";
import type { SkillPatch, SkillStore } from "../skills/store";
import { mapLimit } from "../util/async";

import { type FolderQuestion, type FolderUnchanged, folderComparer } from "./folder-check";
import { type LockMode, runLocked } from "./locking";
import {
  type DownloadCache,
  type RemoteTarget,
  SOURCE_PATH_GONE,
  openLocalSource,
  remoteKey,
  remoteTargetOf,
  resolveRemoteRevision,
} from "./source";

export interface CheckerDeps {
  store: SkillStore;
  git: GitClient;
  download: Download;
  /** The registry client, for ClawHub skills. */
  clawhub?: ClawhubClient;
}

export interface CheckOptions {
  /** Look even when the last answer is still fresh. */
  force?: boolean;
}

export interface CheckRoundOptions extends CheckAllOptions {
  /** `"try"` for background rounds: a skill whose library is busy is skipped. */
  lockMode?: LockMode;
}

export interface Checker {
  check(skillId: string, options?: CheckOptions): Promise<Skill>;
  checkAll(force?: boolean, options?: CheckRoundOptions): Promise<CheckAllResult>;
}

const MAX_CONCURRENT_LOOKUPS = 8;
/** Statuses that are an answer. Anything else is looked up again whatever the age. */
const SETTLED: ReadonlySet<UpdateStatus> = new Set([
  "up_to_date",
  "update_available",
  "local_only",
  "source_missing",
]);
const CHECK_FAILED = "Could not check for updates";

type RemoteOutcome = { revision: string } | { failure: string };

/**
 * What a lookup found. `guard` names what was looked at; if the row points somewhere else by the
 * time we hold the lock, the finding is about a different source and is dropped.
 */
interface Finding {
  guard: string;
  patch(fresh: Skill): SkillPatch;
}

/** True while the last check still counts, so an unforced check can be skipped. */
function isFresh(skill: Skill, now: number): boolean {
  if (!SETTLED.has(skill.updateStatus) || skill.lastCheckedAt === null) return false;
  return now - skill.lastCheckedAt < UPDATE_CHECK_FRESH_MS;
}

/** What the skill points at, read again after a lookup: a different answer drops the result. */
export function sourceGuard(skill: Skill): string {
  return [
    skill.sourceType,
    skill.sourceUrl,
    skill.sourceRef,
    skill.sourceBranch,
    skill.sourceSubpath,
  ].join("\n");
}

function settled(skill: Skill, updateStatus: UpdateStatus, problem: string | null = null): Finding {
  return { guard: sourceGuard(skill), patch: () => ({ updateStatus, lastCheckError: problem }) };
}

/**
 * Without an installed revision the commit is unknown. A skill linked to a source it differs
 * from (its "as installed" snapshot is that source, not the library copy) has an update to
 * offer; otherwise nobody can say.
 */
function statusWithoutRevision(fresh: Skill, installedHash: string | null): UpdateStatus {
  return installedHash && installedHash !== fresh.contentHash ? "update_available" : "unknown";
}

function remoteFinding(
  skill: Skill,
  outcome: RemoteOutcome,
  installedHash: string | null = null,
): Finding {
  // A failed lookup keeps the last revision we saw: "error" says we do not know any better.
  if ("failure" in outcome) return settled(skill, "error", outcome.failure);
  const { revision } = outcome;
  return {
    guard: sourceGuard(skill),
    patch: (fresh) => ({
      remoteRevision: revision,
      lastCheckError: null,
      updateStatus: !fresh.sourceRevision
        ? statusWithoutRevision(fresh, installedHash)
        : fresh.sourceRevision === revision
          ? "up_to_date"
          : "update_available",
    }),
  };
}

/**
 * The commit moved but the skill's folder did not: nothing to update. The skill now counts as
 * installed from the new commit, as an update would record it, so the next check starts there.
 */
function unchangedFolderFinding(skill: Skill, compared: string, revision: string): Finding {
  const fallback = remoteFinding(skill, { revision });
  return {
    guard: sourceGuard(skill),
    patch: (fresh) =>
      fresh.sourceRevision === compared
        ? {
            sourceRevision: revision,
            remoteRevision: revision,
            updateStatus: "up_to_date",
            lastCheckError: null,
          }
        : fallback.patch(fresh),
  };
}

/** The folder question a remote skill raises, or null when its commit did not move. */
function folderQuestion(
  skill: Skill,
  target: RemoteTarget,
  outcome: RemoteOutcome,
): FolderQuestion | null {
  if (target.kind !== "git" || "failure" in outcome || !skill.sourceRevision) return null;
  if (outcome.revision === skill.sourceRevision) return null;
  return { target, from: skill.sourceRevision, to: outcome.revision };
}

/**
 * Compare a folder, archive or archive link with what was installed from it (`installedHash`),
 * so an edit of the library copy is not taken for a change of the source. Skills installed
 * before that was recorded compare with the library. Reads only, so it runs without the lock.
 */
async function localFinding(
  skill: Skill,
  installedHash: string | null,
  download: Download,
  cache?: DownloadCache,
): Promise<Finding> {
  if (!skill.sourceRef) return settled(skill, "local_only");
  try {
    const source = await openLocalSource(skill, download, cache);
    try {
      if (!skill.contentHash) return settled(skill, "local_only");
      const sourceHash = hashAsLibraryCopy(source.dir, skill.dirName);
      if (sourceHash === (installedHash ?? skill.contentHash)) {
        return settled(skill, "up_to_date");
      }
      // A checkout that only flipped line endings is not an update worth offering.
      const same = sameTextAsLibraryCopy(source.dir, skill.dirName, skill.libraryPath);
      return settled(skill, same ? "up_to_date" : "update_available");
    } finally {
      await source.cleanup();
    }
  } catch (error) {
    if (isAppError(error, "NOT_FOUND")) {
      // A dead link says which link; a folder that is gone says so plainly.
      const why = skill.sourceType === "url" ? errorMessage(error) : SOURCE_PATH_GONE;
      return settled(skill, "source_missing", why);
    }
    return settled(skill, "error", errorMessage(error));
  }
}

/** A row whose source cannot be understood is a failed check, not a crash. */
function targetOrFailure(skill: Skill): RemoteTarget | { failure: string } {
  try {
    return remoteTargetOf(skill);
  } catch (error) {
    return { failure: errorMessage(error) };
  }
}

export function createChecker(ctx: CoreContext, deps: CheckerDeps): Checker {
  const { store, git, download } = deps;
  const clients = { git, clawhub: deps.clawhub };

  async function lookup(target: RemoteTarget): Promise<RemoteOutcome> {
    try {
      return { revision: await resolveRemoteRevision(clients, target) };
    } catch (error) {
      return { failure: errorMessage(error) };
    }
  }

  /** Network and hashing happen here, before any lock is taken. */
  async function investigate(
    skill: Skill,
    round: {
      shared?: ReadonlyMap<string, RemoteOutcome>;
      /** Each remote skill's target by skill id, worked out once for the round. */
      targets?: ReadonlyMap<string, RemoteTarget | { failure: string }>;
      downloads?: DownloadCache;
      folders?: FolderUnchanged;
    } = {},
  ): Promise<Finding> {
    if (!isRemoteSource(skill)) {
      return localFinding(
        skill,
        store.installed(skill.id)?.hash ?? null,
        download,
        round.downloads,
      );
    }
    const target = round.targets?.get(skill.id) ?? targetOrFailure(skill);
    if ("failure" in target) return remoteFinding(skill, target);
    const outcome = round.shared?.get(remoteKey(target)) ?? (await lookup(target));
    const question = folderQuestion(skill, target, outcome);
    const folders = round.folders ?? folderComparer(git);
    if (question && (await folders(question))) {
      return unchangedFolderFinding(skill, question.from, question.to);
    }
    return remoteFinding(skill, outcome, store.installed(skill.id)?.hash ?? null);
  }

  /**
   * Record what a lookup found. A dry run records nothing: the skill comes back as the check
   * would have saved it.
   */
  async function apply(
    skill: Skill,
    finding: Finding,
    lockMode: LockMode,
    dryRun = false,
  ): Promise<Skill> {
    if (dryRun) {
      const fresh = store.get(skill.id);
      if (sourceGuard(fresh) !== finding.guard) return fresh;
      return { ...fresh, ...finding.patch(fresh), lastCheckedAt: Date.now() };
    }
    const applied = await runLocked(ctx, lockMode, `check ${skill.name}`, () => {
      const fresh = store.get(skill.id);
      if (sourceGuard(fresh) !== finding.guard) return fresh;
      return store.update(fresh.id, { ...finding.patch(fresh), lastCheckedAt: Date.now() });
    });
    // Only a new installed commit is library metadata; the rest is what the check found.
    ctx.touched(applied.sourceRevision === skill.sourceRevision ? "updates" : "skills");
    return applied;
  }

  return {
    check: async (skillId, options = {}) => {
      const skill = store.get(skillId);
      if (!options.force && isFresh(skill, Date.now())) return skill;
      return apply(skill, await investigate(skill), "wait");
    },

    checkAll: async (force = false, options = {}) => {
      const chosen = options.skillIds ? new Set(options.skillIds) : null;
      const skills = chosen ? store.list().filter((skill) => chosen.has(skill.id)) : store.list();
      const now = Date.now();
      const due = force ? skills : skills.filter((skill) => !isFresh(skill, now));

      const targetOf = new Map(
        due.filter(isRemoteSource).map((skill) => [skill.id, targetOrFailure(skill)]),
      );
      // Many skills come from one repository: ask each (url, branch) once.
      const targets = new Map<string, RemoteTarget>();
      for (const target of targetOf.values()) {
        if (!("failure" in target)) targets.set(remoteKey(target), target);
      }
      const outcomes = new Map<string, RemoteOutcome>();
      await mapLimit([...targets], MAX_CONCURRENT_LOOKUPS, async ([key, target]) => {
        outcomes.set(key, await lookup(target));
      });

      const result: CheckAllResult = {
        succeeded: skills.length - due.length,
        failed: [],
        updateAvailable: [],
      };
      const checkedIds = new Set(due.map((skill) => skill.id));
      for (const skill of skills) {
        if (!checkedIds.has(skill.id) && skill.updateStatus === "update_available") {
          result.updateAvailable.push(skill.id);
        }
      }
      // Skills taken from one archive link download it once per round.
      const downloads: DownloadCache = new Map();
      // Skills of one repository whose commit moved: one fetch of folder trees for all of them.
      const planned = due.flatMap((skill): FolderQuestion[] => {
        const target = targetOf.get(skill.id);
        if (!target || "failure" in target) return [];
        const outcome = outcomes.get(remoteKey(target));
        const question = outcome ? folderQuestion(skill, target, outcome) : null;
        return question ? [question] : [];
      });
      const round = {
        shared: outcomes,
        targets: targetOf,
        downloads,
        folders: folderComparer(git, planned),
      };
      for (const skill of due) {
        try {
          const checked = await apply(
            skill,
            await investigate(skill, round),
            options.lockMode ?? "wait",
            options.dryRun,
          );
          if (checked.updateStatus === "update_available") result.updateAvailable.push(skill.id);
          if (checked.updateStatus === "error") {
            result.failed.push({
              name: skill.name,
              message: checked.lastCheckError ?? CHECK_FAILED,
            });
          } else {
            result.succeeded += 1;
          }
        } catch (error) {
          result.failed.push({ name: skill.name, message: errorMessage(error) });
        }
      }
      return result;
    },
  };
}
