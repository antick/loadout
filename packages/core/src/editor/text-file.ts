import { createHash } from "node:crypto";
import type { LineEnding } from "@loadout/shared";
import { diffArrays } from "diff";

/**
 * How the editor sees a file on disk: UTF-8 text with `\n` line breaks. Whatever the file used
 * (CRLF, a byte-order mark) is remembered and put back on save, so saving an unchanged line
 * never rewrites the whole file. A file that mixes endings keeps each untouched line's own.
 */

/** Largest file the editor opens. Skill files are prose and small scripts. */
export const MAX_EDITABLE_BYTES = 1024 * 1024;
/** How much of a file is inspected to tell text from binary when only listing. */
export const SNIFF_BYTES = 8192;
/**
 * Most line changes worth matching up to keep a mixed file's endings. Past that the save is a
 * rewrite, and every line gets the file's usual ending.
 */
export const MAX_LINE_EDITS = 5000;

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const CRLF = "\r\n";
const LF = "\n";
const LINE_BREAK = /\r\n|\r|\n/g;

export interface DecodedText {
  content: string;
  eol: LineEnding;
  bom: boolean;
  /** The text exactly as on disk, without the byte-order mark. */
  raw: string;
}

/** One line of a file and the break that ends it ("" for the last line). */
interface Line {
  text: string;
  ending: string;
}

export function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function hasBom(bytes: Uint8Array): boolean {
  return bytes.length >= UTF8_BOM.length && UTF8_BOM.every((byte, index) => bytes[index] === byte);
}

/** A NUL byte is the usual sign of a binary file. */
export function looksBinary(bytes: Uint8Array): boolean {
  return bytes.includes(0);
}

/** The ending most lines use. A file without line breaks counts as LF. */
export function detectLineEnding(text: string): LineEnding {
  const crlf = text.split(CRLF).length - 1;
  const lf = text.split(LF).length - 1 - crlf;
  return crlf > lf ? "crlf" : "lf";
}

/** Null when the bytes are not valid UTF-8 text. */
export function decodeText(bytes: Uint8Array): DecodedText | null {
  if (looksBinary(bytes)) return null;
  let text: string;
  try {
    // `ignoreBOM: true` keeps the mark in the text so it can be stripped here and remembered.
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
  const bom = hasBom(bytes);
  const body = bom ? text.slice(1) : text;
  return { content: normalizeLineBreaks(body), eol: detectLineEnding(body), bom, raw: body };
}

/** Every CRLF and lone CR becomes LF, which is what the editor works with. */
export function normalizeLineBreaks(text: string): string {
  return text.replace(/\r\n?/g, LF);
}

function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (const match of text.matchAll(LINE_BREAK)) {
    lines.push({ text: text.slice(start, match.index), ending: match[0] });
    start = match.index + match[0].length;
  }
  lines.push({ text: text.slice(start), ending: "" });
  return lines;
}

/**
 * The ending each line of `normalized` gets: the one it had in `original` when the line is still
 * there, `fallback` for new lines. Null when the edit is too large to match up.
 */
function keptEndings(normalized: string, original: string, fallback: string): string[] | null {
  const before = splitLines(original);
  const changes = diffArrays(
    before.map((line) => line.text),
    normalized.split(LF),
    { maxEditLength: MAX_LINE_EDITS },
  );
  if (!changes) return null;
  const endings: string[] = [];
  let at = 0;
  for (const change of changes) {
    const count = change.value.length;
    if (change.removed) {
      at += count;
    } else if (change.added) {
      for (let index = 0; index < count; index += 1) endings.push(fallback);
    } else {
      // A kept line that was last in the file had no ending of its own.
      for (let index = 0; index < count; index += 1) {
        endings.push(before[at + index]?.ending || fallback);
      }
      at += count;
    }
  }
  return endings;
}

/**
 * Editor text back to the bytes the file should hold, in the file's own conventions. Given the
 * `original` text of a file that mixes endings, untouched lines keep theirs and new lines get
 * `eol`.
 */
export function encodeText(
  content: string,
  eol: LineEnding,
  bom: boolean,
  original?: string,
): Buffer {
  const normalized = normalizeLineBreaks(content);
  const ending = eol === "crlf" ? CRLF : LF;
  const mixed = original !== undefined && new Set(original.match(LINE_BREAK)).size > 1;
  const endings = mixed ? keptEndings(normalized, original, ending) : null;
  const text = endings
    ? normalized
        .split(LF)
        // The last line ends the file: it never gets a break.
        .map((line, index, lines) =>
          index < lines.length - 1 ? line + (endings[index] ?? ending) : line,
        )
        .join("")
    : normalized.replaceAll(LF, ending);
  const body = Buffer.from(text, "utf8");
  return bom ? Buffer.concat([UTF8_BOM, body]) : body;
}
