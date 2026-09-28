import type { DataScope, SyncPreview } from "@loadout/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAppEvent } from "@/lib/events";

/** Changes to these can change what a sync saves: skill files, their tags, presets. */
const LIBRARY_SCOPES: ReadonlySet<DataScope> = new Set(["skills", "presets", "backup"]);

/**
 * Whether the library changed since `review` was worked out. Every change event is only a hint:
 * the library's current state is asked for and compared with the one the review saw, so events
 * from agents' folders, settings or the sync's own writes never raise it by mistake.
 * `busy`: a review or a sync is running; events then are checked once it is done.
 */
export function useReviewStale(review: SyncPreview | null, busy: boolean): boolean {
  // The review found out of date: a new review starts fresh without a reset.
  const [staleReview, setStaleReview] = useState<SyncPreview | null>(null);
  const latest = useRef({ review, busy });
  const running = useRef(false);
  const again = useRef(false);
  const missed = useRef(false);
  useEffect(() => {
    latest.current = { review, busy };
  });

  const check = useCallback(async (): Promise<void> => {
    // One question at a time; changes meanwhile ask once more at the end.
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    try {
      do {
        again.current = false;
        const target = latest.current.review;
        if (!target?.localTree) return;
        const tree = await api.backup.localTree();
        if (latest.current.review === target && tree !== target.localTree) setStaleReview(target);
      } while (again.current);
    } catch {
      // Only a hint for the user; the sync itself never relies on it. Keep the review as it is.
    } finally {
      running.current = false;
    }
  }, []);

  useAppEvent("data:changed", ({ scope }) => {
    if (!scope.some((entry) => LIBRARY_SCOPES.has(entry))) return;
    if (latest.current.busy) missed.current = true;
    else if (latest.current.review) void check();
  });

  useEffect(() => {
    if (!review) missed.current = false;
    else if (!busy && missed.current) {
      missed.current = false;
      void check();
    }
  }, [review, busy, check]);

  return review !== null && staleReview === review;
}
