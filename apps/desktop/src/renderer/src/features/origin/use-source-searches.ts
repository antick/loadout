import type { Skill, SourceSearch } from "@loadout/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { SOURCE_SEARCH_CONCURRENCY } from "@/lib/constants";
import { errorMessage } from "@/lib/toast";

/**
 * Where one skill's search stands. `linked` and `marked` are what the user did with it
 * afterwards; the row stays so the list does not jump while they work through it.
 */
export type SearchRow =
  | { state: "waiting" | "searching" }
  | { state: "done"; search: SourceSearch }
  | { state: "failed"; message: string }
  | { state: "linked" }
  | { state: "marked" };

export interface SourceSearches {
  rows: ReadonlyMap<string, SearchRow>;
  /** Searches that ended, found something or not. */
  done: number;
  running: boolean;
  set(skillId: string, row: SearchRow): void;
}

/**
 * Look for the sources of `skills`, a few at a time, starting when mounted. Unmounting stops
 * what has not started; searches in flight finish unseen.
 */
export function useSourceSearches(skills: readonly Skill[]): SourceSearches {
  const [rows, setRows] = useState<ReadonlyMap<string, SearchRow>>(
    () => new Map(skills.map((skill) => [skill.id, { state: "waiting" }])),
  );
  // The list the dialog opened with: later changes to the library do not restart anything.
  const initial = useRef(skills);

  const set = useCallback((skillId: string, row: SearchRow) => {
    setRows((previous) => new Map(previous).set(skillId, row));
  }, []);

  useEffect(() => {
    // One run per mount: a run that was stopped never writes again, even if it is mid-search.
    const run = { stopped: false };
    const report = (skillId: string, row: SearchRow): void => {
      if (!run.stopped) set(skillId, row);
    };
    const queue = [...initial.current];
    const worker = async (): Promise<void> => {
      for (let skill = queue.shift(); skill && !run.stopped; skill = queue.shift()) {
        report(skill.id, { state: "searching" });
        try {
          report(skill.id, { state: "done", search: await api.updates.findSource(skill.id) });
        } catch (error) {
          report(skill.id, { state: "failed", message: errorMessage(error) });
        }
      }
    };
    for (let index = 0; index < SOURCE_SEARCH_CONCURRENCY; index += 1) void worker();
    return () => {
      run.stopped = true;
    };
  }, [set]);

  let done = 0;
  let running = false;
  for (const row of rows.values()) {
    if (row.state === "waiting" || row.state === "searching") running = true;
    else done += 1;
  }
  return { rows, done, running, set };
}
