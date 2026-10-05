import { closeSync, openSync, readSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import { STREAM_CHUNK_BYTES } from "@loadout/shared";

/**
 * Reading text of any size a bounded piece at a time, so nothing passes unread for being large:
 * a file in chunks, then its lines, an over-long one cut into overlapping pieces.
 */

const NUL = 0;

/**
 * Feed a file's text to `push` a chunk at a time, decoded as UTF-8. Returns true when it holds a
 * NUL byte, the mark of a binary file: reading stops there unless `throughBinary`. Throws when
 * the file cannot be opened or read.
 */
export function readTextChunks(
  path: string,
  push: (text: string) => void,
  throughBinary = false,
): boolean {
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(STREAM_CHUNK_BYTES);
    const decoder = new StringDecoder("utf8");
    let binary = false;
    for (;;) {
      const read = readSync(fd, buffer, 0, buffer.length, null);
      if (read === 0) break;
      const bytes = buffer.subarray(0, read);
      if (!binary && bytes.includes(NUL)) {
        binary = true;
        if (!throughBinary) return true;
      }
      push(decoder.write(bytes));
    }
    push(decoder.end());
    return binary;
  } finally {
    closeSync(fd);
  }
}

export interface LinePieces {
  /** The longest piece of one line handed on at once. */
  pieceChars: number;
  /** Characters each piece of a long line repeats from the one before; longer than any match. */
  overlapChars: number;
}

export interface LineSplitter {
  push(text: string): void;
  /** Hands on the last line, also when it is empty. */
  end(): void;
}

/**
 * Text fed in pieces of any size, handed on a line at a time (`\n` or `\r\n` ends one), numbered
 * from 1. A line longer than `pieceChars` comes in pieces: `ends` is false for all but its last,
 * and each piece repeats the last `overlapChars` of the one before, so a match a border cuts is
 * whole in the next one.
 */
export function createLineSplitter(
  onLine: (text: string, line: number, ends: boolean) => void,
  { pieceChars, overlapChars }: LinePieces,
): LineSplitter {
  let line = 1;
  /** Text after the last line break. */
  let partial = "";
  const whole = (text: string): void => {
    onLine(text.endsWith("\r") ? text.slice(0, -1) : text, line, true);
    line += 1;
  };
  return {
    push(text) {
      const parts = `${partial}${text}`.split("\n");
      partial = parts.pop() ?? "";
      for (const part of parts) whole(part);
      let start = 0;
      while (partial.length - start > pieceChars) {
        onLine(partial.slice(start, start + pieceChars), line, false);
        start += pieceChars - overlapChars;
      }
      if (start > 0) partial = partial.slice(start);
    },
    end() {
      whole(partial);
      partial = "";
    },
  };
}
