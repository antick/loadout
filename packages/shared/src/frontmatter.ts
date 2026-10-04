import { type Document, isMap, parseDocument } from "yaml";

/**
 * The one reader of a document's leading YAML block, as Agent Skills and agents' rule files write
 * it. Every feature that reads frontmatter goes through here, so they all agree on these rules:
 *
 * - The block opens with a `---` line at the start of the text; a byte-order mark and blank lines
 *   before it are allowed.
 * - It closes at the next line that is exactly `---` (trailing spaces or tabs allowed). `----` or
 *   `---x` is YAML, not a fence. A block that never closes is no frontmatter at all.
 * - `---` straight after the opening line is an empty block: no fields, and the body follows.
 * - LF and CRLF line endings both work; the body is returned as written.
 * - Fields are read only when the YAML parses and is a map. Empty YAML (or only comments) is a
 *   map with no fields. Anything else, a list, a scalar, a duplicate key, an alias bomb, is
 *   broken frontmatter: no fields, never an exception.
 * - A field's text (`textField`) is a string, trimmed, or a number or boolean as written by
 *   YAML: `name: 2024` is the name "2024", not a missing name.
 */

const OPEN = /^﻿?\s*---[ \t]*(\r?\n)/;
const CLOSE = /^---[ \t]*(?:\r?\n|$)/;
const CLOSE_AFTER_LINE = /\r?\n---[ \t]*(?:\r?\n|$)/;

/** Where the leading block sits in a text. */
export interface FrontmatterBlock {
  /** The opening `---` line with anything allowed before it, and its line break. */
  open: string;
  /** The line break the document uses after the opening fence. */
  eol: string;
  /** The YAML between the fences; empty for an empty block. */
  source: string;
  /** Offset of `source` in the text. */
  sourceStart: number;
  /** The closing fence line, starting with a line break: `open + fields + close` rebuilds it. */
  close: string;
  /** Offset where the body starts. */
  end: number;
}

/** The leading frontmatter block of `text`, or null when there is none (or it never closes). */
export function findFrontmatter(text: string): FrontmatterBlock | null {
  const opened = OPEN.exec(text);
  if (!opened) return null;
  const open = opened[0];
  const eol = opened[1] ?? "\n";
  const rest = text.slice(open.length);
  const empty = CLOSE.exec(rest);
  if (empty) {
    return {
      open,
      eol,
      source: "",
      sourceStart: open.length,
      close: `${eol}${empty[0]}`,
      end: open.length + empty[0].length,
    };
  }
  const closed = CLOSE_AFTER_LINE.exec(rest);
  if (!closed) return null;
  return {
    open,
    eol,
    source: rest.slice(0, closed.index),
    sourceStart: open.length,
    close: closed[0],
    end: open.length + closed.index + closed[0].length,
  };
}

export interface FrontmatterYaml {
  /** The fields; null when the YAML does not parse or is not a map. */
  data: Record<string, unknown> | null;
  /** The parsed document, for callers that need positions; null when parsing threw. */
  document: Document | null;
  /** Why the fields could not be read, and the offset in the source it is about. */
  error: { reason: string; offset: number } | null;
}

const NOT_A_MAP = "it is not a list of key: value pairs";

/** Read frontmatter YAML. Untrusted text: never throws. */
export function parseFrontmatterYaml(source: string): FrontmatterYaml {
  let document: Document;
  try {
    document = parseDocument(source, { prettyErrors: false });
  } catch (thrown) {
    const reason = thrown instanceof Error ? (thrown.message.split("\n")[0] ?? "") : "";
    return { data: null, document: null, error: { reason, offset: 0 } };
  }
  const failure = document.errors[0];
  if (failure) {
    const reason = failure.message.split("\n")[0] ?? "";
    return { data: null, document, error: { reason, offset: failure.pos[0] } };
  }
  if (document.contents !== null && !isMap(document.contents)) {
    return { data: null, document, error: { reason: NOT_A_MAP, offset: 0 } };
  }
  try {
    const data = (document.toJS() ?? {}) as Record<string, unknown>;
    return { data, document, error: null };
  } catch (thrown) {
    // An alias bomb throws while the values are built.
    const reason = thrown instanceof Error ? (thrown.message.split("\n")[0] ?? "") : "";
    return { data: null, document, error: { reason, offset: 0 } };
  }
}

export interface SplitFrontmatter {
  /** The fields; null when there is no frontmatter or it is broken (see the rules above). */
  data: Record<string, unknown> | null;
  /** The text after the block; the whole text when there is none. */
  body: string;
  block: FrontmatterBlock | null;
}

/** A document's frontmatter fields and the text after them. Never throws. */
export function splitFrontmatter(text: string): SplitFrontmatter {
  const block = findFrontmatter(text);
  if (!block) return { data: null, body: text, block: null };
  return { data: parseFrontmatterYaml(block.source).data, body: text.slice(block.end), block };
}

/** A frontmatter value as trimmed text, or null. Numbers and booleans count as their text. */
export function textField(fields: Record<string, unknown> | null, key: string): string | null {
  const value = fields?.[key];
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
