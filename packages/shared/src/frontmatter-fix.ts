import { isMap, parseDocument, stringify } from "yaml";
import { SKILL_DESCRIPTION_MAX, type SkillIssue, type SkillIssueCode } from "./skill-checks";

/**
 * Fill in what a SKILL.md needs before agents can use it: frontmatter with a `name` and a
 * `description`. Pure, so the app can show the result before anything is saved. Only missing
 * fields are added; every line already there stays as it was, line endings and byte-order mark
 * included. Frontmatter that is not valid YAML is left for a person to fix.
 */

/** What a fix would add. Null fields were already there. */
export interface FrontmatterFix {
  content: string;
  addedName: string | null;
  addedDescription: string | null;
}

const FRONTMATTER_BLOCK = /^(\uFEFF?\s*---[ \t]*(\r?\n))([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/;
const EMPTY_FRONTMATTER = /^(\uFEFF?\s*---[ \t]*(\r?\n))(---[ \t]*(?:\r?\n|$))/;
const FENCE_LINE = /^\s*(`{3,}|~{3,})/;
const HEADING_LINE = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
/** Lines that are not prose: lists, quotes, tables, HTML and rules. */
const NON_PROSE_LINE = /^\s*(?:[-*+]\s|\d+[.)]\s|>|\||<|(?:-{3,}|\*{3,}|_{3,})\s*$)/;
const INLINE_MARKUP = /[*_`]/g;
const LINK_MARKUP = /!?\[([^\]]*)\]\([^)]*\)/g;
const BOM = "\uFEFF";
const FENCE = "---";
const FALLBACK_DESCRIPTION = "Instructions for the agent.";
const ELLIPSIS = "...";

function plainText(line: string): string {
  return line.replace(LINK_MARKUP, "$1").replace(INLINE_MARKUP, "").replace(/\s+/g, " ").trim();
}

function clip(text: string): string {
  if (text.length <= SKILL_DESCRIPTION_MAX) return text;
  return `${text.slice(0, SKILL_DESCRIPTION_MAX - ELLIPSIS.length).trimEnd()}${ELLIPSIS}`;
}

/**
 * A description taken from the document's body: its first paragraph of prose, else its first
 * heading, else a plain placeholder. Code blocks are skipped.
 */
export function describeFromBody(body: string): string {
  let heading: string | null = null;
  let paragraph: string[] = [];
  let fence: string | null = null;
  for (const line of body.split(/\r?\n/)) {
    const marker = FENCE_LINE.exec(line)?.[1];
    if (marker) {
      if (paragraph.length > 0) break;
      fence = fence === null ? marker.charAt(0) : marker.charAt(0) === fence ? null : fence;
      continue;
    }
    if (fence !== null) continue;
    const headingText = HEADING_LINE.exec(line)?.[1];
    if (headingText !== undefined) {
      if (paragraph.length > 0) break;
      heading ??= plainText(headingText) || null;
      continue;
    }
    if (!line.trim() || NON_PROSE_LINE.test(line)) {
      if (paragraph.length > 0) break;
      continue;
    }
    paragraph.push(line);
  }
  const text = plainText(paragraph.join(" "));
  return clip(text || heading || FALLBACK_DESCRIPTION);
}

/** A value on one line, quoted when YAML would read it as something else. */
function yamlValue(value: string): string {
  return stringify(value, { lineWidth: 0 }).trimEnd();
}

function valueLine(key: string): RegExp {
  return new RegExp(`^${key}[ \\t]*:[ \\t]*(?:""|''|~|null)?[ \\t]*$`, "m");
}

function textField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Set one missing field: on its `key:` line when that is empty, else as a new line (the name
 * first, the description after the other fields). A key holding something else, such as a list,
 * is replaced through the YAML document so the result still parses.
 */
function setField(
  body: string,
  record: Record<string, unknown>,
  field: { key: string; value: string; first: boolean },
  eol: string,
): string {
  const { key, value, first } = field;
  const line = `${key}: ${yamlValue(value)}`;
  if (!(key in record)) {
    if (!body) return line;
    return first ? `${line}${eol}${body}` : `${body}${eol}${line}`;
  }
  const current = record[key];
  const emptyLine = valueLine(key);
  if ((current === null || current === "") && emptyLine.test(body)) {
    return body.replace(emptyLine, line);
  }
  const document = parseDocument(body);
  document.set(key, value);
  return document.toString({ lineWidth: 0 }).trimEnd().replaceAll(/\r?\n/g, eol);
}

/**
 * The document with a `name` (the folder name) and a `description` (from the body) filled in when
 * they are missing. Null when there is nothing to add, or when the frontmatter is not valid YAML.
 */
export function fixFrontmatter(content: string, folderName: string): FrontmatterFix | null {
  const empty = EMPTY_FRONTMATTER.exec(content);
  const found = empty ?? FRONTMATTER_BLOCK.exec(content);
  if (!found) {
    const bom = content.startsWith(BOM) ? BOM : "";
    const rest = content.slice(bom.length);
    const eol = /\r\n/.test(rest) ? "\r\n" : "\n";
    const description = describeFromBody(rest);
    const name = `name: ${yamlValue(folderName)}`;
    const block = [FENCE, name, `description: ${yamlValue(description)}`, FENCE];
    return {
      content: `${bom}${block.join(eol)}${eol}${rest}`,
      addedName: folderName,
      addedDescription: description,
    };
  }

  // Before the fields, the fields, then the closing fence and the body.
  const eol = found[2] ?? "\n";
  const open = found[1] ?? "";
  const body = empty ? "" : (found[3] ?? "");
  const close = empty ? `${eol}${found[3] ?? ""}` : (found[4] ?? "");
  const head = content.slice(0, found.index);
  const after = content.slice(found.index + found[0].length);

  const document = parseDocument(body);
  if (document.errors.length > 0) return null;
  const parsed: unknown = document.toJS();
  if (parsed !== null && parsed !== undefined && !isMap(document.contents)) return null;
  const record = (parsed ?? {}) as Record<string, unknown>;

  const addedName = textField(record, "name") ? null : folderName;
  const addedDescription = textField(record, "description") ? null : describeFromBody(after);
  if (addedName === null && addedDescription === null) return null;

  let next = body;
  if (addedName !== null) {
    next = setField(next, record, { key: "name", value: addedName, first: true }, eol);
  }
  if (addedDescription !== null) {
    const field = { key: "description", value: addedDescription, first: false };
    next = setField(next, record, field, eol);
  }
  return { content: `${head}${open}${next}${close}${after}`, addedName, addedDescription };
}

/** Problems `fixFrontmatter` can put right. */
const FIXABLE_CODES: ReadonlySet<SkillIssueCode> = new Set([
  "frontmatter_missing",
  "name_missing",
  "description_missing",
]);

/** True when a skill has a problem the frontmatter fix can put right. */
export function canFixFrontmatter(issues: readonly SkillIssue[]): boolean {
  return issues.some((issue) => FIXABLE_CODES.has(issue.code));
}
