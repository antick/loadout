import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SKILL_DOCUMENT_FILES, SKILL_MARKER_FILES } from "@loadout/shared";
import { parse, parseDocument, stringify } from "yaml";
import { isInside, canonicalPath, readDirSafe, statOrNull } from "../util/fs";
import { inferSkillName } from "../util/names";

export interface SkillFrontmatter {
  name: string | null;
  description: string | null;
}

const FENCE = "---";
const DOCUMENT_SEARCH_DEPTH = 4;
const EMPTY: SkillFrontmatter = { name: null, description: null };

/** Read `name` and `description` from YAML frontmatter. Any problem yields nulls, never throws. */
export function parseFrontmatter(text: string): SkillFrontmatter {
  const trimmed = text.trim();
  if (!trimmed.startsWith(FENCE)) return EMPTY;
  const end = trimmed.indexOf(`\n${FENCE}`, FENCE.length);
  if (end === -1) return EMPTY;
  try {
    const data: unknown = parse(trimmed.slice(FENCE.length, end));
    if (typeof data !== "object" || data === null) return EMPTY;
    const record = data as Record<string, unknown>;
    return {
      name: typeof record.name === "string" ? record.name.trim() || null : null,
      description:
        typeof record.description === "string" ? record.description.trim() || null : null,
    };
  } catch {
    return EMPTY;
  }
}

export function readFrontmatter(skillDir: string): SkillFrontmatter {
  for (const marker of SKILL_MARKER_FILES) {
    try {
      return parseFrontmatter(readFileSync(join(skillDir, marker), "utf8"));
    } catch {
      // Try the next marker name.
    }
  }
  return EMPTY;
}

export interface SkillIdentity {
  name: string;
  description: string | null;
}

export function readSkillIdentity(skillDir: string): SkillIdentity {
  const frontmatter = readFrontmatter(skillDir);
  return { name: inferSkillName(frontmatter.name, skillDir), description: frontmatter.description };
}

function findDocument(dir: string, depth: number): string | null {
  const entries = readDirSafe(dir);
  const fileNames = new Set(
    entries.filter((e) => e.isFile() || e.isSymbolicLink()).map((e) => e.name),
  );
  for (const candidate of SKILL_DOCUMENT_FILES) {
    if (fileNames.has(candidate)) return join(dir, candidate);
  }
  if (depth <= 0) return null;
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const found = findDocument(join(dir, entry.name), depth - 1);
    if (found) return found;
  }
  return null;
}

export interface FoundDocument {
  filename: string;
  content: string;
}

/**
 * The file shown as a skill's document: a marker or readme at the root, else the first found a
 * few levels down. A symlinked document must resolve inside `containmentRoot`.
 */
export function readSkillDocument(
  skillDir: string,
  containmentRoot = skillDir,
): FoundDocument | null {
  const path = findDocument(skillDir, DOCUMENT_SEARCH_DEPTH);
  if (!path) return null;
  if (!isInside(canonicalPath(containmentRoot), canonicalPath(path))) return null;
  if (!statOrNull(path)?.isFile()) return null;
  try {
    return { filename: path.slice(skillDir.length + 1), content: readFileSync(path, "utf8") };
  } catch {
    return null;
  }
}

const FRONTMATTER_BLOCK = /^(\uFEFF?\s*---[ \t]*(\r?\n))([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/;
/** A `name:` whose value sits on its own line, not a `|` or `>` block. */
const NAME_LINE = /^name[ \t]*:[ \t]*(?![|>])[^\r\n]*$/m;
const NAME_KEY = /^name[ \t]*:/m;

/**
 * The same document with `name` set in its frontmatter; every other line, the line endings and a
 * byte-order mark stay as they were. A document without frontmatter comes back unchanged.
 */
export function setFrontmatterName(content: string, name: string): string {
  const match = FRONTMATTER_BLOCK.exec(content);
  if (!match) return content;
  const [whole, open = "", eol = "\n", body = "", close = ""] = match;
  // Quoted when YAML would read it as something else (`123`, `true`, `null`).
  const value = stringify(name).trimEnd();
  let next: string;
  if (NAME_LINE.test(body)) {
    next = body.replace(NAME_LINE, `name: ${value}`);
  } else if (NAME_KEY.test(body)) {
    const document = parseDocument(body);
    document.set("name", name);
    next = document.toString({ lineWidth: 0 }).trimEnd().replaceAll("\n", eol);
  } else {
    next = body ? `name: ${value}${eol}${body}` : `name: ${value}`;
  }
  const start = match.index;
  return `${content.slice(0, start)}${open}${next}${close}${content.slice(start + whole.length)}`;
}
