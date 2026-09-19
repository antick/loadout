export interface FrontmatterEntry {
  key: string;
  value: string;
}

export interface ParsedDocument {
  entries: FrontmatterEntry[];
  body: string;
}

const FRONTMATTER_PATTERN = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const KEY_LINE_PATTERN = /^([A-Za-z0-9_.-]+):\s*(.*)$/;
const BLOCK_SCALAR_MARKERS = new Set(["|", ">", "|-", ">-", "|+", ">+"]);

function unquote(value: string): string {
  const trimmed = value.trim();
  const quoted =
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")));
  return quoted ? trimmed.slice(1, -1) : trimmed;
}

/**
 * Split a leading YAML frontmatter block off a Markdown document. Display-only: top-level keys
 * become entries and indented or list lines are folded into the key above them.
 */
export function parseFrontmatter(source: string): ParsedDocument {
  const match = FRONTMATTER_PATTERN.exec(source);
  if (!match) return { entries: [], body: source };

  const entries: FrontmatterEntry[] = [];
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const keyLine = /^\s/.test(line) ? null : KEY_LINE_PATTERN.exec(line);
    if (keyLine) {
      const raw = keyLine[2] ?? "";
      entries.push({
        key: keyLine[1] ?? "",
        value: BLOCK_SCALAR_MARKERS.has(raw.trim()) ? "" : unquote(raw),
      });
      continue;
    }
    const last = entries.at(-1);
    if (!last) continue;
    const piece = unquote(line.trim().replace(/^-\s+/, ""));
    last.value = last.value
      ? `${last.value}${line.trim().startsWith("-") ? ", " : " "}${piece}`
      : piece;
  }
  return { entries, body: source.slice(match[0].length) };
}
