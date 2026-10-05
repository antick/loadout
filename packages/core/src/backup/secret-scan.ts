import { createHash } from "node:crypto";
import type { SecretFinding } from "@loadout/shared";
import { SECRET_PATTERNS as PATTERNS } from "../util/secret-patterns";
import { createLineSplitter, readTextChunks } from "../util/text-stream";

/**
 * Searching text for well-known key and token formats, for the backup's push check and for
 * publishing. A file of any size is read in pieces, so nothing passes unread for being large;
 * only binary files (a NUL byte anywhere) are not text and are skipped.
 */

/**
 * A line longer than this many characters is searched in pieces, each repeating the last
 * {@link OVERLAP_CHARS} of the one before: far longer than any key, so a key a border cuts is
 * still whole in the next piece.
 */
const PIECE_CHARS = 1024 * 1024;
const OVERLAP_CHARS = 4096;
/** Characters of a match shown on each side of the hidden middle. */
const MASK_KEEP = 4;
const ID_LENGTH = 16;
/** Documentation examples (AWS's `AKIAIOSFODNN7EXAMPLE`, `sk-xxxx…`) are not secrets. */
const PLACEHOLDER = /example|x{6,}|\*{4,}/i;
/** Lines a private key block may span; its `END` line closes it. */
const MAX_KEY_BLOCK_LINES = 200;

function mask(match: string): string {
  if (match.length <= MASK_KEEP * 2) return "•".repeat(match.length);
  return `${match.slice(0, MASK_KEEP)}…${match.slice(-MASK_KEEP)}`;
}

/** Stable for the same text in the same file. */
function findingId(file: string, match: string): string {
  return createHash("sha256").update(`${file}\0${match}`).digest("hex").slice(0, ID_LENGTH);
}

/** The whole key block from its `BEGIN` line, so allowing one key never allows another. */
function keyBlock(lines: readonly string[], start: number): string {
  const end = lines.findIndex((line, index) => index >= start && line.includes("-----END "));
  const last = end === -1 ? Math.min(lines.length, start + MAX_KEY_BLOCK_LINES) : end + 1;
  return lines.slice(start, last).join("\n");
}

/** Text fed in pieces of any size; the findings once it has all been fed. */
interface Scanner {
  push(text: string): void;
  end(): SecretFinding[];
}

function createScanner(file: string, path: string, committed: boolean): Scanner {
  const findings: SecretFinding[] = [];
  // One finding per distinct secret per line, however often a piece border repeats the line.
  const seen = new Set<string>();
  /** Whole lines not searched yet, from line number `first`. The last ones wait as the lines a
   * key block above them may run into. */
  let lines: string[] = [];
  let first = 1;

  /** Search `context[index]`; matches ending at `before` or later are left for the next piece. */
  const search = (
    context: readonly string[],
    index: number,
    line: number,
    before = Number.POSITIVE_INFINITY,
  ): void => {
    for (const { kind, regex } of PATTERNS) {
      for (const match of (context[index] ?? "").matchAll(regex)) {
        const value = match[0];
        if (match.index + value.length >= before || PLACEHOLDER.test(value)) continue;
        const id = findingId(file, kind === "private_key" ? keyBlock(context, index) : value);
        if (seen.has(`${line}\0${id}`)) continue;
        seen.add(`${line}\0${id}`);
        findings.push({ id, file, path, line, kind, masked: mask(value), committed });
      }
    }
  };

  /** Search every whole line but the ones a key block above them may still need. */
  const flush = (all: boolean): void => {
    const count = all ? lines.length : lines.length - MAX_KEY_BLOCK_LINES;
    for (let index = 0; index < count; index += 1) search(lines, index, first + index);
    if (count <= 0) return;
    lines = lines.slice(count);
    first += count;
  };

  const splitter = createLineSplitter(
    (text, line, ends) => {
      if (ends) {
        lines.push(text);
        if (lines.length > MAX_KEY_BLOCK_LINES * 2) flush(false);
      } else {
        // A piece of an over-long line: what touches its end is searched again in the next.
        search([text], 0, line, text.length);
      }
    },
    { pieceChars: PIECE_CHARS, overlapChars: OVERLAP_CHARS },
  );

  return {
    push: (text) => splitter.push(text),
    end() {
      splitter.end();
      flush(true);
      // An over-long line is searched before the lines above it that still wait.
      return findings.sort((a, b) => a.line - b.line);
    },
  };
}

/** Every match in one file's text, one per distinct secret per line. */
export function findSecrets(
  file: string,
  path: string,
  text: string,
  committed = false,
): SecretFinding[] {
  const scanner = createScanner(file, path, committed);
  scanner.push(text);
  return scanner.end();
}

/** Every match in a file on disk, read a piece at a time. Null for a binary file. */
export function findSecretsInFile(
  file: string,
  path: string,
  committed = false,
): SecretFinding[] | null {
  const scanner = createScanner(file, path, committed);
  return readTextChunks(path, scanner.push) ? null : scanner.end();
}
