/**
 * Library skills that look like one skill installed twice: the same files, a rewritten copy, or
 * two skills that say much the same under a similar name. Found on request, never on their own,
 * and only ever offered: nothing is removed until a person picks the skill to keep.
 */

/**
 * `SKILL.md` texts this alike (0 to 1, by shared lines in order) count as the same skill. Below
 * it, skills on one subject still share plenty of headings and boilerplate.
 */
export const DUPLICATE_CONTENT_MIN = 0.6;
/** Names this alike (0 to 1, by edit distance) are worth a look when the descriptions agree. */
export const DUPLICATE_NAME_MIN = 0.7;
/** Share of description words two skills with alike names must have in common. */
export const DUPLICATE_DESCRIPTION_MIN = 0.4;
/** Words shorter than this say nothing about a subject (`the`, `for`, `use`). */
export const DUPLICATE_WORD_MIN_LENGTH = 4;

/**
 * Why two skills are listed together, strongest first. `identical`: every file is the same.
 * `content`: the documents are mostly the same lines. `name`: alike names and descriptions.
 */
export const DUPLICATE_REASONS = ["identical", "content", "name"] as const;
export type DuplicateReason = (typeof DUPLICATE_REASONS)[number];

/** Two library skills that may be one. `a` and `b` are skill ids, in a fixed order. */
export interface DuplicatePair {
  /** Same for the pair whichever order it is asked in; see `duplicatePairKey`. */
  key: string;
  a: string;
  b: string;
  reason: DuplicateReason;
  /** How alike the two `SKILL.md` texts are, 0 to 1. */
  contentScore: number;
  /** How alike the two names are, 0 to 1. */
  nameScore: number;
  /** The user said these are not the same skill; they are left out unless asked for. */
  dismissed: boolean;
}

export interface DuplicatesReport {
  /** Strongest first. */
  pairs: DuplicatePair[];
  /** Pairs the user dismissed, whether or not `pairs` lists them. */
  dismissedCount: number;
  /**
   * The documents' text was compared, now or by an earlier look at the same library. When false,
   * only skills with the same files or alike names and descriptions are listed.
   */
  similarText: boolean;
}

export interface DuplicatesOptions {
  /** Also list the pairs the user said are not duplicates. */
  includeDismissed?: boolean;
  /**
   * Also compare the `SKILL.md` texts, every one with every other: slow on a big library, so only
   * when someone asks. A newer look stops one still running.
   */
  similarText?: boolean;
}

export interface DuplicateMergeOptions {
  /** Report what would be carried over and removed; change nothing. */
  dryRun?: boolean;
}

/** What `duplicates.merge` did (or, on a dry run, would do) before it removed the skill. */
export interface DuplicateMergeResult {
  keptId: string;
  removedId: string;
  /** Tags the kept skill gained from the removed one. */
  tagsAdded: number;
  /** Presets the kept skill joined in place of the removed one. */
  presetsJoined: number;
  /** Agents the kept skill was deployed to because the removed one had been. */
  deployedTo: string[];
  /** Agents the removed skill was on but the kept one is blocked for. */
  blockedFor: string[];
  /** Entry in Recently removed that puts the removed skill back; null when none was kept. */
  removedEntryId: string | null;
}

export interface DuplicatesApi {
  /** Look through the library for skills that may be one. Reads files; changes nothing. */
  find(options?: DuplicatesOptions): Promise<DuplicatesReport>;
  /** Say the two are not the same skill: they are not listed again. NOT_FOUND for an unknown id. */
  dismiss(idA: string, idB: string): Promise<void>;
  /** Take a dismissal back. */
  undismiss(idA: string, idB: string): Promise<void>;
  /**
   * Keep one skill and remove the other. The kept skill first gains the removed one's tags and
   * presets and is deployed where it was, so nothing that pointed at it is lost. Nothing is
   * removed if that fails. The removed skill goes to Recently removed.
   */
  merge(
    keepId: string,
    removeId: string,
    options?: DuplicateMergeOptions,
  ): Promise<DuplicateMergeResult>;
}

/** The same text for both orders of a pair. Skill ids never contain `:`. */
export function duplicatePairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
}

/** "94%": a score for a person to read. */
export function formatSimilarity(score: number): string {
  return `${Math.round(Math.min(Math.max(score, 0), 1) * 100)}%`;
}
