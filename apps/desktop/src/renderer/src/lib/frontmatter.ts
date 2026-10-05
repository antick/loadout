import { splitFrontmatter } from "@loadout/shared";

interface FrontmatterEntry {
  key: string;
  value: string;
}

export interface ParsedDocument {
  entries: FrontmatterEntry[];
  body: string;
}

const LIST_SEPARATOR = ", ";
const BACKTICK_RUN = /`+/g;
const MIN_FENCE = 3;

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value) && value.every((item) => typeof item !== "object" || item === null)) {
    return value.map(displayValue).join(LIST_SEPARATOR);
  }
  return JSON.stringify(value);
}

/** YAML shown as a code block, fenced so no backticks inside can close it early. */
function yamlBlock(source: string): string {
  const longest = Math.max(0, ...(source.match(BACKTICK_RUN) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(MIN_FENCE, longest + 1));
  return `${fence}yaml\n${source}\n${fence}\n\n`;
}

/**
 * Split a leading YAML frontmatter block off a Markdown document, by the shared rules
 * (`splitFrontmatter`). Top-level keys become entries; frontmatter that does not parse is shown
 * as it is, as YAML at the top of the body.
 */
export function parseFrontmatter(source: string): ParsedDocument {
  const { data, body, block } = splitFrontmatter(source);
  if (!block) return { entries: [], body: source };
  if (!data) return { entries: [], body: `${yamlBlock(block.source)}${body}` };
  const entries = Object.entries(data).map(([key, value]) => ({ key, value: displayValue(value) }));
  return { entries, body };
}
