import { createHash } from "node:crypto";
import type { LineEnding } from "@loadout/shared";

/**
 * How the editor sees a file on disk: UTF-8 text with `\n` line breaks. Whatever the file used
 * (CRLF, a byte-order mark) is remembered and put back on save, so saving an unchanged line
 * never rewrites the whole file.
 */

/** Largest file the editor opens. Skill files are prose and small scripts. */
export const MAX_EDITABLE_BYTES = 1024 * 1024;
/** How much of a file is inspected to tell text from binary when only listing. */
export const SNIFF_BYTES = 8192;

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const CRLF = "\r\n";
const LF = "\n";

export interface DecodedText {
  content: string;
  eol: LineEnding;
  bom: boolean;
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
  return { content: normalizeLineBreaks(body), eol: detectLineEnding(body), bom };
}

/** Every CRLF and lone CR becomes LF, which is what the editor works with. */
export function normalizeLineBreaks(text: string): string {
  return text.replace(/\r\n?/g, LF);
}

/** Editor text back to the bytes the file should hold, in the file's own conventions. */
export function encodeText(content: string, eol: LineEnding, bom: boolean): Buffer {
  const normalized = normalizeLineBreaks(content);
  const text = eol === "crlf" ? normalized.replaceAll(LF, CRLF) : normalized;
  const body = Buffer.from(text, "utf8");
  return bom ? Buffer.concat([UTF8_BOM, body]) : body;
}
