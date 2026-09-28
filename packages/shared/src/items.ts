/**
 * Library items besides skills: subagents, slash commands and rules. Each is one Markdown file
 * with YAML frontmatter, kept in the library in one shared format and converted into each
 * agent's own format when it is deployed.
 */

export const ITEM_KINDS = ["subagent", "command", "rule"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** Folder inside the library's `skills/` folder (the backup repository) holding every item. */
export const ITEMS_DIR_NAME = ".loadout-items";

/** One folder per kind inside `ITEMS_DIR_NAME`. */
export const ITEM_KIND_DIRS: Record<ItemKind, string> = {
  subagent: "subagents",
  command: "commands",
  rule: "rules",
};

export const ITEM_FILE_EXTENSION = ".md";
export const ITEM_NAME_MAX = 64;
/** Lowercase letters, digits and single hyphens or underscores, like a skill name. */
const ITEM_NAME = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

export function isItemKind(value: unknown): value is ItemKind {
  return typeof value === "string" && ITEM_KINDS.some((kind) => kind === value);
}

/** Why a name cannot be used for an item, or null when it can. */
export function itemNameProblem(name: string): "empty" | "too_long" | "format" | null {
  if (!name) return "empty";
  if (name.length > ITEM_NAME_MAX) return "too_long";
  return ITEM_NAME.test(name) ? null : "format";
}

/** Path of an item relative to the library's `skills/` folder, `/` separated. */
export function itemRelativePath(kind: ItemKind, name: string): string {
  return `${ITEMS_DIR_NAME}/${ITEM_KIND_DIRS[kind]}/${name}${ITEM_FILE_EXTENSION}`;
}

/** The kind and name of a relative item path, or null when it is not one (read from any source). */
export function parseItemPath(path: string): { kind: ItemKind; name: string } | null {
  const parts = path.split("/");
  if (parts.length !== 3 || parts[0] !== ITEMS_DIR_NAME) return null;
  const kind = ITEM_KINDS.find((candidate) => ITEM_KIND_DIRS[candidate] === parts[1]);
  const file = parts[2] ?? "";
  if (!kind || !file.endsWith(ITEM_FILE_EXTENSION)) return null;
  const name = file.slice(0, -ITEM_FILE_EXTENSION.length);
  return itemNameProblem(name) === null ? { kind, name } : null;
}
