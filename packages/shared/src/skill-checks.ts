import { isMap, parseDocument } from "yaml";

/**
 * Checks of a skill against the Agent Skills format (agentskills.io/specification). Pure, so the
 * app runs it on saved skills and the editor runs it on unsaved text. Whether linked files exist
 * needs the file system; this module only lists the links (`references`) for the caller to test.
 *
 * Errors stop agents from using the skill properly; warnings break a rule or a recommendation
 * that most agents tolerate.
 */

export type SkillIssueSeverity = "error" | "warning";

export const SKILL_ISSUE_CODES = [
  "document_missing",
  "frontmatter_missing",
  "frontmatter_invalid",
  "name_missing",
  "description_missing",
  "name_format",
  "name_too_long",
  "name_mismatch",
  "description_too_long",
  "compatibility_too_long",
  "document_too_long",
  "broken_reference",
] as const;
export type SkillIssueCode = (typeof SKILL_ISSUE_CODES)[number];

export interface SkillIssue {
  code: SkillIssueCode;
  severity: SkillIssueSeverity;
  /** English sentence for the CLI and logs; the app words it from `code` and `params`. */
  message: string;
  params: Record<string, string | number>;
}

export interface DocumentCheck {
  issues: SkillIssue[];
  /** Relative files the document links to, `/` separated, without `#fragment` or `?query`. */
  references: string[];
}

export const SKILL_NAME_MAX = 64;
export const SKILL_DESCRIPTION_MAX = 1024;
export const SKILL_COMPATIBILITY_MAX = 500;
/** The specification recommends keeping SKILL.md under this many lines. */
export const SKILL_DOCUMENT_MAX_LINES = 500;

const SEVERITY: Record<SkillIssueCode, SkillIssueSeverity> = {
  document_missing: "error",
  frontmatter_missing: "error",
  frontmatter_invalid: "error",
  name_missing: "error",
  description_missing: "error",
  name_format: "warning",
  name_too_long: "warning",
  name_mismatch: "warning",
  description_too_long: "warning",
  compatibility_too_long: "warning",
  document_too_long: "warning",
  broken_reference: "warning",
};

const MESSAGES: Record<SkillIssueCode, (params: Record<string, string | number>) => string> = {
  document_missing: () => "The skill has no SKILL.md.",
  frontmatter_missing: () =>
    "SKILL.md does not start with frontmatter (a block between two --- lines).",
  frontmatter_invalid: (p) => `The frontmatter is not valid YAML: ${p.reason}`,
  name_missing: () => "The frontmatter has no name.",
  description_missing: () => "The frontmatter has no description.",
  name_format: (p) =>
    `The name "${p.name}" should use only lowercase letters, numbers and single hyphens, and not start or end with a hyphen.`,
  name_too_long: (p) => `The name is ${p.length} characters; the limit is ${p.max}.`,
  name_mismatch: (p) => `The name "${p.name}" differs from the folder name "${p.folder}".`,
  description_too_long: (p) => `The description is ${p.length} characters; the limit is ${p.max}.`,
  compatibility_too_long: (p) =>
    `The compatibility note is ${p.length} characters; the limit is ${p.max}.`,
  document_too_long: (p) =>
    `SKILL.md is ${p.lines} lines; keeping it under ${p.max} and moving detail to other files is recommended.`,
  broken_reference: (p) => `SKILL.md links to ${p.path}, which is not in the skill.`,
};

export function skillIssue(
  code: SkillIssueCode,
  params: Record<string, string | number> = {},
): SkillIssue {
  return { code, severity: SEVERITY[code], message: MESSAGES[code](params), params };
}

export function hasSkillErrors(issues: readonly SkillIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

const FRONTMATTER_PATTERN = /^﻿?\s*---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FENCE_PATTERN = /^(\s*)(`{3,}|~{3,})/;
const INLINE_CODE_PATTERN = /`[^`]*`/g;
const LINK_PATTERN = /!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+["'(][^)]*)?\)/g;
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

/** A frontmatter value as trimmed text, or null when it is absent, empty or not text. */
function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Normalise `./a/../b` style paths; null when the path climbs out of the skill folder. */
function normalizeRelative(path: string): string | null {
  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return null;
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.length > 0 ? segments.join("/") : null;
}

function decode(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** Relative links of a Markdown body, outside code blocks and inline code. */
export function findReferences(body: string): { references: string[]; outside: string[] } {
  const references = new Set<string>();
  const outside = new Set<string>();
  let fence: string | null = null;
  for (const line of body.split(/\r?\n/)) {
    const marker = FENCE_PATTERN.exec(line)?.[2];
    if (marker) {
      if (fence === null) fence = marker.charAt(0);
      else if (marker.charAt(0) === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    for (const match of line.replace(INLINE_CODE_PATTERN, "").matchAll(LINK_PATTERN)) {
      const target = match[1] ?? "";
      if (!target || target.startsWith("#") || target.startsWith("/")) continue;
      if (SCHEME_PATTERN.test(target)) continue;
      const bare = decode(target.split(/[?#]/)[0] ?? "");
      if (!bare) continue;
      const normalized = normalizeRelative(bare.replaceAll("\\", "/"));
      if (normalized) references.add(normalized);
      else outside.add(bare);
    }
  }
  return { references: [...references].sort(), outside: [...outside].sort() };
}

/**
 * Check a SKILL.md text (null when the skill has none) for the skill folder `folderName`.
 * Links that climb out of the skill folder are reported here; the caller checks the rest exist.
 */
export function checkSkillDocument(content: string | null, folderName: string): DocumentCheck {
  if (content === null) return { issues: [skillIssue("document_missing")], references: [] };
  const issues: SkillIssue[] = [];
  const match = FRONTMATTER_PATTERN.exec(content);
  const body = match ? content.slice(match[0].length) : content;

  const lines = content.split(/\r?\n/).length;
  if (lines > SKILL_DOCUMENT_MAX_LINES) {
    issues.push(skillIssue("document_too_long", { lines, max: SKILL_DOCUMENT_MAX_LINES }));
  }
  const { references, outside } = findReferences(body);
  for (const path of outside) issues.push(skillIssue("broken_reference", { path }));

  if (!match) {
    issues.unshift(skillIssue("frontmatter_missing"));
    return { issues, references };
  }

  const document = parseDocument(match[1] ?? "", { prettyErrors: false });
  const error = document.errors[0];
  if (error || (document.contents !== null && !isMap(document.contents))) {
    const reason = error ? error.message.split("\n")[0] : "it is not a list of key: value pairs";
    issues.unshift(skillIssue("frontmatter_invalid", { reason: reason ?? "" }));
    return { issues, references };
  }
  const data = (document.toJS() ?? {}) as Record<string, unknown>;

  const name = text(data.name);
  const description = text(data.description);
  const head: SkillIssue[] = [];
  if (!name) head.push(skillIssue("name_missing"));
  if (!description) head.push(skillIssue("description_missing"));
  if (name) {
    if (name.length > SKILL_NAME_MAX) {
      head.push(skillIssue("name_too_long", { length: name.length, max: SKILL_NAME_MAX }));
    }
    if (!NAME_PATTERN.test(name)) head.push(skillIssue("name_format", { name }));
    if (name !== folderName) head.push(skillIssue("name_mismatch", { name, folder: folderName }));
  }
  if (description && description.length > SKILL_DESCRIPTION_MAX) {
    head.push(
      skillIssue("description_too_long", {
        length: description.length,
        max: SKILL_DESCRIPTION_MAX,
      }),
    );
  }
  const compatibility = text(data.compatibility);
  if (compatibility && compatibility.length > SKILL_COMPATIBILITY_MAX) {
    head.push(
      skillIssue("compatibility_too_long", {
        length: compatibility.length,
        max: SKILL_COMPATIBILITY_MAX,
      }),
    );
  }
  return { issues: [...head, ...issues], references };
}
