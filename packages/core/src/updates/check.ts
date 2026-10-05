import {
  type BatchResult,
  type CheckAllOptions,
  type Skill,
  UPDATE_CHECK_FRESH_MS,
  type UpdateStatus,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import type { ClawhubClient } from "../market/clawhub";
import { errorMessage, isAppError } from "../errors";
import type { Download, GitClient, GitInputOptions } from "../install";
import { hashAsLibraryCopy } from "../skills/numbered-name";
import type { SkillPatch, SkillStore } from "../skills/store";
import { mapLimit } from "../util/async";
import { hashDir } from "../util/hash";
import { type FolderQuestion, type FolderUnchanged, folderComparer } from "./folder-check";
import { type LockMode, runLocked } from "./locking";
import {
  type DownloadCache,
  type RemoteTarget,
  SOURCE_PATH_GONE,
  isRemoteSource,
  openLocalSource,
  remoteKey,
  remoteTargetOf,
  resolveRemoteRevision,
} from "./source";

export interface CheckerDeps {
  store: SkillStore;
  git: GitClient;
  download: Download;
  /** How stored repository URLs are read (`InstallService.gitInput`). */
  gitInput?: GitInputOptions;
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
  checkAll(force?: boolean, options?: CheckRoundOptions): Promise<BatchResult>;
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
const EOL_INSENSITIVE = { ignoreLineEndings: true } as const;

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
function guardOf(skill: Skill): string {
  return [
    skill.sourceType,
    skill.sourceUrl,
    skill.sourceRef,
    skill.sourceBranch,
    skill.sourceSubpath,
  ].join("\n");
}

function settled(skill: Skill, updateStatus: UpdateStatus, problem: string | null = null): Finding {
  return { guard: guardOf(skill), patch: () => ({ updateStatus, lastCheckError: problem }) };
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
    guard: guardOf(skill),
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
    guard: guardOf(skill),
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
      const sourceText = hashAsLibraryCopy(source.dir, skill.dirName, EOL_INSENSITIVE);
      const same =
        sourceText !== null && sourceText === hashDir(skill.libraryPath, EOL_INSENSITIVE);
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
function targetOrFailure(
  skill: Skill,
  gitInput: GitInputOptions | undefined,
): RemoteTarget | { failure: string } {
  try {
    return remoteTargetOf(skill, gitInput);
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
    const target = targetOrFailure(skill, deps.gitInput);
    if ("failure" in target) return remoteFinding(skill, target);
    const outcome = round.shared?.get(remoteKey(target)) ?? (await lookup(target));
    const question = folderQuestion(skill, target, outcome);
    const folders = round.folders ?? folderComparer(git);
    if (question && (await folders(question))) {
      return unchangedFolderFinding(skill, question.from, question.to);
    }
    return remoteFinding(skill, outcome, store.installed(skill.id)?.hash ?? null);
  }

  async function apply(skill: Skill, finding: Finding, lockMode: LockMode): Promise<Skill> {
    const applied = await runLocked(ctx, lockMode, `check ${skill.name}`, () => {
      const fresh = store.get(skill.id);
      if (guardOf(fresh) !== finding.guard) return fresh;
      return store.update(fresh.id, { ...finding.patch(fresh), lastCheckedAt: Date.now() });
    });
    ctx.touched("skills");
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

      // Many skills come from one repository: ask each (url, branch) once.
      const targets = new Map<string, RemoteTarget>();
      for (const skill of due.filter(isRemoteSource)) {
        const target = targetOrFailure(skill, deps.gitInput);
        if (!("failure" in target)) targets.set(remoteKey(target), target);
      }
      const outcomes = new Map<string, RemoteOutcome>();
      await mapLimit([...targets], MAX_CONCURRENT_LOOKUPS, async ([key, target]) => {
        outcomes.set(key, await lookup(target));
      });

      const result: BatchResult = { succeeded: skills.length - due.length, failed: [] };
      // Skills taken from one archive link download it once per round.
      const downloads: DownloadCache = new Map();
      // Skills of one repository whose commit moved: one fetch of folder trees for all of them.
      const planned = due.flatMap((skill): FolderQuestion[] => {
        if (!isRemoteSource(skill)) return [];
        const target = targetOrFailure(skill, deps.gitInput);
        if ("failure" in target) return [];
        const outcome = outcomes.get(remoteKey(target));
        const question = outcome ? folderQuestion(skill, target, outcome) : null;
        return question ? [question] : [];
      });
      const round = { shared: outcomes, downloads, folders: folderComparer(git, planned) };
      for (const skill of due) {
        try {
          const checked = await apply(
            skill,
            await investigate(skill, round),
            options.lockMode ?? "wait",
          );
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
