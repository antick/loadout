import type { InstallProgress } from "@loadout/shared";

/** The latest progress of each background task, one per key, the most recently heard last. */
export type BackgroundWork = readonly InstallProgress[];

/** Record a task's progress; it replaces what that task said before. */
export function withProgress(work: BackgroundWork, progress: InstallProgress): BackgroundWork {
  return [...work.filter((entry) => entry.key !== progress.key), progress];
}

/** Forget a task once its "done" has been shown long enough, unless it started again since. */
export function withoutFinished(work: BackgroundWork, key: string): BackgroundWork {
  const entry = work.find((item) => item.key === key);
  return entry?.phase === "done" ? work.filter((item) => item.key !== key) : work;
}

/** What the status bar shows: the latest task still running, else the latest one just done. */
export function shownProgress(work: BackgroundWork): InstallProgress | null {
  return work.findLast((entry) => entry.phase !== "done") ?? work.at(-1) ?? null;
}
