import {
  AUTO_UPDATE_INTERVAL_MS,
  MINUTE_MS,
  type AppEvents,
  type BatchResult,
  type Skill,
  type SourceCheckResult,
  type UpdateResult,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { isAppError } from "../errors";
import { INTERNAL_KEYS } from "../settings/store";
import { pause } from "../util/async";
import { type KnownRevision, checkedSince } from "../sources";
import type { LockMode } from "./locking";
import { isRemoteSource } from "./source";
import type { UpdateOptions } from "./update";

/**
 * Background update rounds. A slow clock ticks every quarter of an hour and starts a round once
 * the interval chosen in Settings has passed. A round never waits for the library: whatever is
 * busy is skipped and picked up next time. It never approves removals either, so an update that
 * would delete files stays "available" until a person has looked at the list.
 */

export const AUTO_FIRST_TICK_MS = MINUTE_MS;
export const AUTO_TICK_MS = 15 * MINUTE_MS;
/** Breathing room before each update a round applies, so it never hammers a host or the disk. */
export const AUTO_SKILL_PAUSE_MS = 200;

type AutoRunSummary = AppEvents["updates:auto-ran"];

/** The parts of the updates service a round drives. */
export interface AutoUpdateTarget {
  skills(): Skill[];
  /** One check of the whole library: one lookup per repository, not one per skill. */
  checkAll(force: boolean, options: { lockMode: LockMode }): Promise<BatchResult>;
  update(skillId: string, approval: null, options: UpdateOptions): Promise<UpdateResult>;
  /** Look for skills repositories gained; adds them when that setting is on. */
  checkSources(known: KnownRevision): Promise<SourceCheckResult>;
}

export interface AutoUpdater {
  start(): void;
  stop(): void;
  /** Run a round right now, whatever the interval says. Joins a round already running. */
  runNow(): Promise<AutoRunSummary>;
  /** When the last round finished (epoch ms), 0 when none has. */
  lastRunAt(): number;
}

type Visit = "updated" | "available" | "failed" | "none";

const BACKGROUND = { lockMode: "try" } as const;

/** Skills with nothing upstream to look at are left out of a round. */
function isTracked(skill: Skill): boolean {
  return isRemoteSource(skill) || Boolean(skill.sourceRef);
}

export function createAutoUpdater(ctx: CoreContext, target: AutoUpdateTarget): AutoUpdater {
  let timer: NodeJS.Timeout | null = null;
  let stopped = true;
  let abortRound = false;
  let inFlight: Promise<AutoRunSummary> | null = null;

  function schedule(delayMs: number): void {
    if (timer) clearTimeout(timer);
    // Never keeps the process alive: a CLI run or a closing app must be free to exit.
    timer = setTimeout(() => void tick(), delayMs).unref();
  }

  function lastRunAt(): number {
    return ctx.settings.getRaw(INTERNAL_KEYS.autoUpdateLastRunAt, 0);
  }

  function isDue(now: number): boolean {
    const every = AUTO_UPDATE_INTERVAL_MS[ctx.settings.get("autoUpdateInterval")];
    if (every <= 0) return false;
    const last = lastRunAt();
    return last === 0 || last + every <= now;
  }

  /** What the check found for `checked`, and the update when applying is on. */
  async function visit(checked: Skill, apply: boolean, known: KnownRevision): Promise<Visit> {
    if (checked.updateStatus === "error") return "failed";
    if (checked.updateStatus !== "update_available") return "none";
    // Local sources are only reported: copying someone's working folder is their call.
    if (!apply || !isRemoteSource(checked)) return "available";
    await pause(AUTO_SKILL_PAUSE_MS);
    if (abortRound) return "none";
    try {
      const outcome = await target.update(checked.id, null, {
        ...BACKGROUND,
        knownRevision: known(checked),
      });
      if (outcome.pendingRemovals.length > 0) return "available";
      return outcome.contentChanged ? "updated" : "none";
    } catch (error) {
      if (isAppError(error, "BUSY")) return "available";
      ctx.log.warn(`Automatic update of ${checked.name} failed`, error);
      return "failed";
    }
  }

  async function round(): Promise<AutoRunSummary> {
    abortRound = false;
    const summary: AutoRunSummary = {
      ranAt: Date.now(),
      updated: 0,
      available: 0,
      failed: 0,
      added: 0,
    };
    const apply = ctx.settings.get("autoUpdateApply");
    // What this round's check found is used as it is: each repository is asked once a round.
    const checkedFrom = Date.now();
    const known = checkedSince(checkedFrom);
    try {
      // A skill the library was too busy to check keeps its last answer for this round.
      await target.checkAll(true, BACKGROUND);
    } catch (error) {
      ctx.log.warn("Automatic update check failed", error);
    }
    for (const skill of target.skills().filter(isTracked)) {
      // Stopped half way: leave the last-run time alone so the next launch finishes the job.
      if (abortRound) return summary;
      const outcome = await visit(skill, apply, known);
      if (outcome !== "none") summary[outcome] += 1;
    }
    if (abortRound) return summary;
    try {
      // A repository that cannot be reached already failed its skills' checks above.
      const sources = await target.checkSources(known);
      summary.added = sources.added.length;
      for (const failure of sources.failed) {
        ctx.log.warn(`Looking for new skills in ${failure.name} failed: ${failure.message}`);
      }
    } catch (error) {
      ctx.log.warn("Looking for new skills in sources failed", error);
    }
    summary.ranAt = Date.now();
    ctx.settings.setRaw(INTERNAL_KEYS.autoUpdateLastRunAt, summary.ranAt);
    ctx.emit("updates:auto-ran", summary);
    return summary;
  }

  function runNow(): Promise<AutoRunSummary> {
    inFlight ??= round().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  async function tick(): Promise<void> {
    timer = null;
    if (stopped) return;
    try {
      if (isDue(Date.now())) await runNow();
    } catch (error) {
      ctx.log.warn("Automatic update round failed", error);
    } finally {
      if (!stopped) schedule(AUTO_TICK_MS);
    }
  }

  return {
    start: () => {
      stopped = false;
      schedule(AUTO_FIRST_TICK_MS);
    },

    stop: () => {
      stopped = true;
      abortRound = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },

    runNow,
    lastRunAt,
  };
}
