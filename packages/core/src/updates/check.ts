import type { BatchResult, Skill, UpdateStatus } from "@loadout/shared";
import type { CoreContext } from "../context";
import { errorMessage, isAppError } from "../errors";
import type { Download, GitClient } from "../install";
import type { SkillPatch, SkillStore } from "../skills/store";
import { mapLimit } from "../util/async";
import { hashDir } from "../util/hash";
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
}

export interface CheckOptions {
  /** Look even when the last answer is still fresh. */
  force?: boolean;
  lockMode?: LockMode;
}

export interface Checker {
  check(skillId: string, options?: CheckOptions): Promise<Skill>;
  checkAll(force?: boolean): Promise<BatchResult>;
}

const MAX_CONCURRENT_LOOKUPS = 8;
const MS_PER_MINUTE = 60_000;
/** Statuses that are an answer. Anything else is looked up again whatever the age. */
const SETTLED: ReadonlySet<UpdateStatus> = new Set([
  "up_to_date",
  "update_available",
  "local_only",
  "source_missing",
]);
const UNRESOLVABLE = "unresolvable";
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
export function isFresh(skill: Skill, ttlMinutes: number, now: number): boolean {
  if (!SETTLED.has(skill.updateStatus) || skill.lastCheckedAt === null) return false;
  return now - skill.lastCheckedAt < ttlMinutes * MS_PER_MINUTE;
}

function guardOf(skill: Skill): string {
  if (!isRemoteSource(skill)) return `local\n${skill.sourceRef ?? ""}`;
  try {
    return remoteKey(remoteTargetOf(skill));
  } catch {
    return UNRESOLVABLE;
  }
}

function settled(skill: Skill, updateStatus: UpdateStatus, problem: string | null = null): Finding {
  return { guard: guardOf(skill), patch: () => ({ updateStatus, lastCheckError: problem }) };
}

function remoteFinding(skill: Skill, outcome: RemoteOutcome): Finding {
  // A failed lookup keeps the last revision we saw: "error" says we do not know any better.
  if ("failure" in outcome) return settled(skill, "error", outcome.failure);
  const { revision } = outcome;
  return {
    guard: guardOf(skill),
    patch: (fresh) => ({
      remoteRevision: revision,
      lastCheckError: null,
      updateStatus: !fresh.sourceRevision
        ? "unknown"
        : fresh.sourceRevision === revision
          ? "up_to_date"
          : "update_available",
    }),
  };
}

/**
 * Compare a folder, archive or archive link with the library. Reads only, so it runs without the
 * lock.
 */
async function localFinding(
  skill: Skill,
  download: Download,
  cache?: DownloadCache,
): Promise<Finding> {
  if (!skill.sourceRef) return settled(skill, "local_only");
  try {
    const source = await openLocalSource(skill, download, cache);
    try {
      if (!skill.contentHash) return settled(skill, "local_only");
      if (hashDir(source.dir) === skill.contentHash) return settled(skill, "up_to_date");
      // A checkout that only flipped line endings is not an update worth offering.
      const sourceText = hashDir(source.dir, EOL_INSENSITIVE);
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
function targetOrFailure(skill: Skill): RemoteTarget | { failure: string } {
  try {
    return remoteTargetOf(skill);
  } catch (error) {
    return { failure: errorMessage(error) };
  }
}

export function createChecker(ctx: CoreContext, deps: CheckerDeps): Checker {
  const { store, git, download } = deps;

  async function lookup(target: RemoteTarget): Promise<RemoteOutcome> {
    try {
      return { revision: await resolveRemoteRevision(git, target) };
    } catch (error) {
      return { failure: errorMessage(error) };
    }
  }

  /** Network and hashing happen here, before any lock is taken. */
  async function investigate(
    skill: Skill,
    shared?: ReadonlyMap<string, RemoteOutcome>,
    downloads?: DownloadCache,
  ): Promise<Finding> {
    if (!isRemoteSource(skill)) return localFinding(skill, download, downloads);
    const target = targetOrFailure(skill);
    if ("failure" in target) return remoteFinding(skill, target);
    return remoteFinding(skill, shared?.get(remoteKey(target)) ?? (await lookup(target)));
  }

  async function apply(skill: Skill, finding: Finding, lockMode: LockMode): Promise<Skill> {
    const applied = await runLocked(ctx, lockMode, `check ${skill.name}`, () => {
      const fresh = store.get(skill.id);
      if (guardOf(fresh) !== finding.guard) return fresh;
      // A check is not an edit: the skill's own "last changed" time stays as it was.
      return store.update(fresh.id, {
        ...finding.patch(fresh),
        lastCheckedAt: Date.now(),
        updatedAt: fresh.updatedAt,
      });
    });
    ctx.touched("skills");
    return applied;
  }

  function ttl(): number {
    return ctx.settings.get("updateCheckTtlMinutes");
  }

  return {
    check: async (skillId, options = {}) => {
      const skill = store.get(skillId);
      if (!options.force && isFresh(skill, ttl(), Date.now())) return skill;
      return apply(skill, await investigate(skill), options.lockMode ?? "wait");
    },

    checkAll: async (force = false) => {
      const skills = store.list();
      const now = Date.now();
      const due = force ? skills : skills.filter((skill) => !isFresh(skill, ttl(), now));

      // Many skills come from one repository: ask each (url, branch) once.
      const targets = new Map<string, RemoteTarget>();
      for (const skill of due.filter(isRemoteSource)) {
        const target = targetOrFailure(skill);
        if (!("failure" in target)) targets.set(remoteKey(target), target);
      }
      const outcomes = new Map<string, RemoteOutcome>();
      await mapLimit([...targets], MAX_CONCURRENT_LOOKUPS, async ([key, target]) => {
        outcomes.set(key, await lookup(target));
      });

      const result: BatchResult = { succeeded: skills.length - due.length, failed: [] };
      // Skills taken from one archive link download it once per round.
      const downloads: DownloadCache = new Map();
      for (const skill of due) {
        try {
          const checked = await apply(skill, await investigate(skill, outcomes, downloads), "wait");
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
