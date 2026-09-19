import {
  AUTO_UPDATE_INTERVAL_MS,
  type AppEvents,
  type Skill,
  type UpdateResult,
} from "@skillboard/shared";
import type { CoreContext } from "../context";
import { isAppError } from "../errors";
import { pause } from "../util/async";
import type { CheckOptions } from "./check";
import { isRemoteSource } from "./source";
import type { UpdateOptions } from "./update";

/**
 * Background update rounds. A slow clock ticks every quarter of an hour and starts a round once
 * the interval chosen in Settings has passed. A round never waits for the library: whatever is
 * busy is skipped and picked up next time. It never approves removals either, so an update that
 * would delete files stays "available" until a person has looked at the list.
 */

export const AUTO_FIRST_TICK_MS = 60_000;
export const AUTO_TICK_MS = 15 * 60_000;
/** Breathing room between skills, so a round never hammers a host or the disk. */
export const AUTO_SKILL_PAUSE_MS = 200;

export type AutoRunSummary = AppEvents["updates:auto-ran"];

/** The parts of the updates service a round drives. */
export interface AutoUpdateTarget {
  skills(): Skill[];
  check(skillId: string, options: CheckOptions): Promise<Skill>;
  update(skillId: string, approval: null, options: UpdateOptions): Promise<UpdateResult>;
}

export interface AutoUpdater {
  start(): void;
  stop(): void;
  /** Run a round right now, whatever the interval says. Joins a round already running. */
  runNow(): Promise<AutoRunSummary>;
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

  function isDue(now: number): boolean {
    const every = AUTO_UPDATE_INTERVAL_MS[ctx.settings.get("autoUpdateInterval")];
    if (every <= 0) return false;
    const last = ctx.settings.get("autoUpdateLastRunAt");
    return last === 0 || last + every <= now;
  }

  async function visit(skill: Skill, apply: boolean): Promise<Visit> {
    let checked: Skill;
    try {
      checked = await target.check(skill.id, { force: true, ...BACKGROUND });
    } catch (error) {
      if (isAppError(error, "BUSY")) return "none";
      ctx.log.warn(`Automatic update check of ${skill.name} failed`, error);
      return "failed";
    }
    if (checked.updateStatus === "error") return "failed";
    if (checked.updateStatus !== "update_available") return "none";
    // Local sources are only reported: copying someone's working folder is their call.
    if (!apply || !isRemoteSource(checked)) return "available";
    try {
      const outcome = await target.update(skill.id, null, BACKGROUND);
      if (outcome.pendingRemovals.length > 0) return "available";
      return outcome.contentChanged ? "updated" : "none";
    } catch (error) {
      if (isAppError(error, "BUSY")) return "available";
      ctx.log.warn(`Automatic update of ${skill.name} failed`, error);
      return "failed";
    }
  }

  async function round(): Promise<AutoRunSummary> {
    abortRound = false;
    const summary: AutoRunSummary = { ranAt: Date.now(), updated: 0, available: 0, failed: 0 };
    const apply = ctx.settings.get("autoUpdateApply");
    for (const skill of target.skills().filter(isTracked)) {
      await pause(AUTO_SKILL_PAUSE_MS);
      // Stopped half way: leave the last-run time alone so the next launch finishes the job.
      if (abortRound) return summary;
      const outcome = await visit(skill, apply);
      if (outcome !== "none") summary[outcome] += 1;
    }
    summary.ranAt = Date.now();
    ctx.settings.set("autoUpdateLastRunAt", summary.ranAt);
    ctx.touched("settings");
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
  };
}
