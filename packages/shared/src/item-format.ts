import { isMap, parseDocument, stringify } from "yaml";
import { FRONTMATTER_BLOCK } from "./frontmatter";

/**
 * Reading and writing the two file shapes items come in: Markdown with YAML frontmatter, and the
 * small TOML files Gemini CLI commands and Codex agents use. Pure, so the app can preview a
 * conversion without touching the disk.
 */

export interface MarkdownDocument {
  /** Frontmatter fields in file order; empty when there is none. */
  fields: Record<string, unknown>;
  body: string;
}

/** Split a Markdown file. Frontmatter that is not a YAML map is treated as having none. */
export function parseMarkdown(text: string): MarkdownDocument {
  const normalized = text.replace(/\r\n/g, "\n");
  const match = FRONTMATTER_BLOCK.exec(normalized);
  if (!match) return { fields: {}, body: normalized.replace(/^\uFEFF/, "") };
  const body = normalized.slice(match[0].length);
  const document = parseDocument(match[3] ?? "");
  if (document.errors.length > 0 || !isMap(document.contents)) return { fields: {}, body };
  const value: unknown = document.toJS();
  return { fields: (value ?? {}) as Record<string, unknown>, body };
}

/** Frontmatter (left out when there are no fields) and body, with `\n` line endings. */
export function formatMarkdown(fields: Record<string, unknown>, body: string): string {
  const kept = Object.entries(fields).filter(([, value]) => value !== undefined && value !== null);
  const text = body.replace(/^\n+/, "");
  if (kept.length === 0) return text;
  const yaml = stringify(Object.fromEntries(kept), { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${text}`;
}

/** A frontmatter value as trimmed text, or null. */
export function textField(fields: Record<string, unknown>, key: string): string | null {
  const value = fields[key];
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** A list written as a YAML list or as one comma separated string. */
export function listField(fields: Record<string, unknown>, key: string): string[] {
  const value = fields[key];
  const items = Array.isArray(value)
    ? value.map(String)
    : typeof value === "string"
      ? value.split(",")
      : [];
  return items.map((item) => item.trim()).filter(Boolean);
}

/** A TOML basic string, escaped. */
function tomlString(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\t/g, "\\t")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
  return `"${escaped}"`;
}

/** A TOML multi-line basic string: every backslash and run of quotes stays literal. */
function tomlMultiline(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"""/g, '""\\"');
  return `"""\n${escaped}"""`;
}

/** Top-level string keys only, in order; multi-line when a value spans lines. */
export function formatToml(entries: readonly (readonly [string, string])[]): string {
  return `${entries
    .map(
      ([key, value]) =>
        `${key} = ${value.includes("\n") ? tomlMultiline(value) : tomlString(value)}`,
    )
    .join("\n")}\n`;
}

const ESCAPES: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  '"': '"',
  "\\": "\\",
  b: "\b",
  f: "\f",
};

function unescapeBasic(text: string): string {
  return text.replace(
    /\\(u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|[ntr"\\bf]|\n\s*)/g,
    (_, code: string) => {
      if (code.startsWith("u") || code.startsWith("U")) {
        return String.fromCodePoint(Number.parseInt(code.slice(1), 16));
      }
      // A backslash at the end of a line joins it with the next non-blank text.
      if (code.startsWith("\n")) return "";
      return ESCAPES[code] ?? code;
    },
  );
}

/**
 * The top-level string keys of a simple TOML file: basic, literal and multi-line strings. Tables,
 * arrays and other types are skipped. Enough for Gemini CLI commands and Codex agents.
 */
export function parseTomlStrings(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const source = text.replace(/\r\n/g, "\n");
  const pattern =
    /^[ \t]*([A-Za-z0-9_-]+)[ \t]*=[ \t]*("""\n?([\s\S]*?)"""|'''\n?([\s\S]*?)'''|"((?:[^"\\\n]|\\.)*)"|'([^'\n]*)')/gm;
  let tableStarted = false;
  let index = 0;
  for (const match of source.matchAll(pattern)) {
    // Keys after the first `[table]` header belong to that table, not the top level.
    const before = source.slice(index, match.index);
    if (/^[ \t]*\[/m.test(before)) tableStarted = true;
    index = match.index + match[0].length;
    if (tableStarted) break;
    const key = match[1] ?? "";
    if (match[3] !== undefined) result[key] = unescapeBasic(match[3]);
    else if (match[4] !== undefined) result[key] = match[4];
    else if (match[5] !== undefined) result[key] = unescapeBasic(match[5]);
    else if (match[6] !== undefined) result[key] = match[6];
  }
  return result;
}
