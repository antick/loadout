import {
  DUPLICATE_CONTENT_MIN,
  DUPLICATE_DESCRIPTION_MIN,
  DUPLICATE_NAME_MIN,
  DUPLICATE_WORD_MIN_LENGTH,
  type DuplicateReason,
  duplicatePairKey,
} from "@loadout/shared";
import { comparedLines, lineCounts, linesSimilarity, sharedCount } from "../origin/similarity";
import { yieldToEventLoop } from "../util/async";

/** What comparing two library skills needs to know about each. */
export interface SimilarityInput {
  id: string;
  name: string;
  description: string | null;
  /** The text of its `SKILL.md`; empty when it has none, or when texts are not compared. */
  document: string;
  /** Hash of every file; two skills with one hash are the same files. */
  contentHash: string | null;
}

export interface SimilarPair {
  key: string;
  /** Skill ids, in the order of `key`. */
  a: string;
  b: string;
  reason: DuplicateReason;
  contentScore: number;
  nameScore: number;
}

/**
 * Below this many lines in common (of all lines in both, counted once) two documents are not
 * compared in order at all: it is the cheap test that keeps a big library fast, and it lies well
 * under what `DUPLICATE_CONTENT_MIN` needs.
 */
const SHARED_LINES_PREFILTER = 0.3;
/** Longest stretch of comparing before other work gets a turn. */
const SLICE_MS = 10;

export interface SimilarOptions {
  /**
   * Compare the documents' text too: every one with every other, slow on a big library. Without
   * it only the same files and alike names and descriptions count, which stays cheap.
   */
  similarText?: boolean;
}

export interface SliceOptions extends SimilarOptions {
  /** Asked between slices: false stops the look, a newer one having replaced it. */
  stillWanted?: () => boolean;
}

function lineSet(text: string): Set<string> {
  const lines = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) lines.add(trimmed);
  }
  return lines;
}

/** Share of all distinct lines that both sets hold. */
function jaccard<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): number {
  if (left.size === 0 || right.size === 0) return 0;
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  let shared = 0;
  for (const item of small) if (large.has(item)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** Edit distance between two texts, by the two-row method. */
function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }
  return previous[right.length] ?? 0;
}

/** How alike two skill names are, 0 to 1, without regard to letter case. */
export function nameSimilarity(left: string, right: string): number {
  const a = left.trim().toLowerCase();
  const b = right.trim().toLowerCase();
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - editDistance(a, b) / longest;
}

function wordSet(text: string | null): Set<string> {
  const words = (text ?? "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(words.filter((word) => word.length >= DUPLICATE_WORD_MIN_LENGTH));
}

/** What a skill is compared by, worked out once rather than once for every other skill. */
interface Prepared {
  input: SimilarityInput;
  lines: Set<string>;
  words: Set<string>;
  /** The document's lines as `textSimilarity` reads them, each line as a number. */
  ordered: number[];
  counts: Map<number, number>;
}

function prepare(skills: readonly SimilarityInput[], similarText: boolean): Prepared[] {
  // One number per distinct line across the library: numbers compare faster than text.
  const numbers = new Map<string, number>();
  const numberOf = (line: string): number => {
    let found = numbers.get(line);
    if (found === undefined) {
      found = numbers.size;
      numbers.set(line, found);
    }
    return found;
  };
  return skills.map((input) => {
    const ordered = similarText ? comparedLines(input.document).map(numberOf) : [];
    return {
      input,
      lines: similarText ? lineSet(input.document) : new Set<string>(),
      words: wordSet(input.description),
      ordered,
      counts: lineCounts(ordered),
    };
  });
}

function classify(left: Prepared, right: Prepared): Omit<SimilarPair, "key" | "a" | "b"> | null {
  const nameScore = nameSimilarity(left.input.name, right.input.name);
  const hash = left.input.contentHash;
  if (hash !== null && hash === right.input.contentHash) {
    return { reason: "identical", contentScore: 1, nameScore };
  }
  const alikeNames = (): boolean =>
    nameScore >= DUPLICATE_NAME_MIN &&
    jaccard(left.words, right.words) >= DUPLICATE_DESCRIPTION_MIN;
  let contentScore = 0;
  if (
    left.lines.size > 0 &&
    right.lines.size > 0 &&
    jaccard(left.lines, right.lines) >= SHARED_LINES_PREFILTER
  ) {
    // Lines in common in any order are never fewer than in order. Below the bar, the ordered
    // comparison runs only for a pair listed for its names, whose score is shown all the same.
    const total = left.ordered.length + right.ordered.length;
    const bound = total === 0 ? 1 : (2 * sharedCount(left.counts, right.counts)) / total;
    if (bound >= DUPLICATE_CONTENT_MIN || alikeNames()) {
      contentScore = linesSimilarity(left.ordered, right.ordered);
    }
  }
  if (contentScore >= DUPLICATE_CONTENT_MIN) return { reason: "content", contentScore, nameScore };
  if (alikeNames()) return { reason: "name", contentScore, nameScore };
  return null;
}

/** Order pairs by how sure we are: same files, then the alike documents, then the alike names. */
function strength(pair: SimilarPair): number {
  if (pair.reason === "identical") return 2;
  return pair.reason === "content" ? pair.contentScore : pair.nameScore * pair.contentScore;
}

/** Compares every pair, pausing (`yield`) after each one so a caller can let other work run. */
function* comparePairs(
  skills: readonly SimilarityInput[],
  similarText: boolean,
): Generator<void, SimilarPair[]> {
  // Without text, the empty line sets make `classify` skip the costly comparison.
  const prepared = prepare(skills, similarText);
  const pairs: SimilarPair[] = [];
  for (let i = 0; i < prepared.length; i += 1) {
    for (let j = i + 1; j < prepared.length; j += 1) {
      const left = prepared[i];
      const right = prepared[j];
      if (!left || !right) continue;
      const found = classify(left, right);
      yield;
      if (!found) continue;
      const [a, b] = left.input.id < right.input.id ? [left, right] : [right, left];
      pairs.push({
        key: duplicatePairKey(a.input.id, b.input.id),
        a: a.input.id,
        b: b.input.id,
        ...found,
      });
    }
  }
  return pairs.sort((x, y) => strength(y) - strength(x) || (x.key < y.key ? -1 : 1));
}

/**
 * Every pair of skills that may be one, strongest first. Pure: the caller reads the files. A skill
 * is compared with every other, so a group of three copies lists all three pairs.
 */
export function findSimilarPairs(
  skills: readonly SimilarityInput[],
  { similarText = true }: SimilarOptions = {},
): SimilarPair[] {
  const steps = comparePairs(skills, similarText);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

/**
 * `findSimilarPairs`, giving the event loop a turn every `SLICE_MS`: a big library takes a while,
 * and the app's other calls must not wait for it. Null when `stillWanted` said to stop.
 */
export async function findSimilarPairsInSlices(
  skills: readonly SimilarityInput[],
  { similarText = true, stillWanted = () => true }: SliceOptions = {},
): Promise<SimilarPair[] | null> {
  const steps = comparePairs(skills, similarText);
  let sliceStart = performance.now();
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
    if (performance.now() - sliceStart >= SLICE_MS) {
      await yieldToEventLoop();
      if (!stillWanted()) return null;
      sliceStart = performance.now();
    }
  }
}
