import {
  DUPLICATE_CONTENT_MIN,
  DUPLICATE_DESCRIPTION_MIN,
  DUPLICATE_NAME_MIN,
  DUPLICATE_WORD_MIN_LENGTH,
  type DuplicateReason,
  duplicatePairKey,
} from "@loadout/shared";
import { textSimilarity } from "../origin/similarity";

/** What comparing two library skills needs to know about each. */
export interface SimilarityInput {
  id: string;
  name: string;
  description: string | null;
  /** The text of its `SKILL.md`; empty when it has none. */
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

interface Prepared {
  input: SimilarityInput;
  lines: Set<string>;
  words: Set<string>;
}

function classify(left: Prepared, right: Prepared): Omit<SimilarPair, "key" | "a" | "b"> | null {
  const nameScore = nameSimilarity(left.input.name, right.input.name);
  const hash = left.input.contentHash;
  if (hash !== null && hash === right.input.contentHash) {
    return { reason: "identical", contentScore: 1, nameScore };
  }
  let contentScore = 0;
  if (
    left.lines.size > 0 &&
    right.lines.size > 0 &&
    jaccard(left.lines, right.lines) >= SHARED_LINES_PREFILTER
  ) {
    contentScore = textSimilarity(left.input.document, right.input.document);
  }
  if (contentScore >= DUPLICATE_CONTENT_MIN) return { reason: "content", contentScore, nameScore };
  if (
    nameScore >= DUPLICATE_NAME_MIN &&
    jaccard(left.words, right.words) >= DUPLICATE_DESCRIPTION_MIN
  ) {
    return { reason: "name", contentScore, nameScore };
  }
  return null;
}

/** Order pairs by how sure we are: same files, then the alike documents, then the alike names. */
function strength(pair: SimilarPair): number {
  if (pair.reason === "identical") return 2;
  return pair.reason === "content" ? pair.contentScore : pair.nameScore * pair.contentScore;
}

/**
 * Every pair of skills that may be one, strongest first. Pure: the caller reads the files. A skill
 * is compared with every other, so a group of three copies lists all three pairs.
 */
export function findSimilarPairs(skills: readonly SimilarityInput[]): SimilarPair[] {
  const prepared: Prepared[] = skills.map((input) => ({
    input,
    lines: lineSet(input.document),
    words: wordSet(input.description),
  }));
  const pairs: SimilarPair[] = [];
  for (let i = 0; i < prepared.length; i += 1) {
    for (let j = i + 1; j < prepared.length; j += 1) {
      const left = prepared[i];
      const right = prepared[j];
      if (!left || !right) continue;
      const found = classify(left, right);
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
