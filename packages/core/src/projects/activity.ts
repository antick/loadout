import { INTERNAL_KEYS, type SettingsStore } from "../settings/store";

/**
 * Which projects are pinned and when each was opened, for the sidebar's Pinned and Frequent
 * groups. Kept with this computer's settings: it is about how this person works here, so it is
 * never backed up, and a library from another computer starts with none.
 */

/** Opens older than this no longer count. */
export const PROJECT_OPENS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** Coming back sooner than this is the same visit, not another open. */
const SAME_VISIT_MS = 15 * 60 * 1000;
/** Opens kept per project; more than a month's worth for anyone. */
const MAX_OPENS_KEPT = 200;

interface StoredActivity {
  pinned: string[];
  /** Epoch ms of each open, oldest first. */
  opens: Record<string, number[]>;
}

export interface ProjectActivitySummary {
  pinned: boolean;
  recentOpens: number;
  lastOpenedAt: number | null;
}

const EMPTY: StoredActivity = { pinned: [], opens: {} };

export class ProjectActivity {
  readonly #settings: SettingsStore;

  constructor(settings: SettingsStore) {
    this.#settings = settings;
  }

  #read(): StoredActivity {
    const stored = this.#settings.getRaw<Partial<StoredActivity>>(
      INTERNAL_KEYS.projectActivity,
      EMPTY,
    );
    return {
      pinned: Array.isArray(stored.pinned) ? stored.pinned : [],
      opens: stored.opens && typeof stored.opens === "object" ? stored.opens : {},
    };
  }

  #write(activity: StoredActivity): void {
    this.#settings.setRaw(INTERNAL_KEYS.projectActivity, activity);
  }

  summary(projectId: string, now = Date.now()): ProjectActivitySummary {
    const activity = this.#read();
    const opens = activity.opens[projectId] ?? [];
    return {
      pinned: activity.pinned.includes(projectId),
      recentOpens: opens.filter((at) => now - at <= PROJECT_OPENS_WINDOW_MS).length,
      lastOpenedAt: opens.at(-1) ?? null,
    };
  }

  setPinned(projectId: string, pinned: boolean): void {
    const activity = this.#read();
    const rest = activity.pinned.filter((id) => id !== projectId);
    this.#write({ ...activity, pinned: pinned ? [...rest, projectId] : rest });
  }

  /** Count an open, unless it continues the visit before. Returns whether it counted. */
  recordOpen(projectId: string, now = Date.now()): boolean {
    const activity = this.#read();
    const opens = (activity.opens[projectId] ?? []).filter(
      (at) => now - at <= PROJECT_OPENS_WINDOW_MS,
    );
    const last = opens.at(-1);
    if (last !== undefined && now - last < SAME_VISIT_MS) return false;
    const next = [...opens, now].slice(-MAX_OPENS_KEPT);
    this.#write({ ...activity, opens: { ...activity.opens, [projectId]: next } });
    return true;
  }

  forget(projectId: string): void {
    const activity = this.#read();
    const { [projectId]: _gone, ...opens } = activity.opens;
    this.#write({ pinned: activity.pinned.filter((id) => id !== projectId), opens });
  }
}
