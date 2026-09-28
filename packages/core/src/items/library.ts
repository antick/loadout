import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ITEMS_DIR_NAME,
  ITEM_FILE_EXTENSION,
  ITEM_KINDS,
  ITEM_KIND_DIRS,
  type ItemKind,
  itemNameProblem,
  itemRelativePath,
} from "@loadout/shared";
import { AppError, exists, invalid, notFound } from "../errors";
import { ensureDir, readDirSafe, removePathSync, statOrNull, writeFileAtomic } from "../util/fs";
import { sha256Hex } from "../util/hash";

/** One item file in the library, as read from disk. */
export interface StoredItem {
  kind: ItemKind;
  name: string;
  path: string;
  content: string;
  /** SHA-256 of the text. Sent back on save, so a change made on disk meanwhile is noticed. */
  hash: string;
  modifiedAt: number;
}

/**
 * The library's subagents, commands and rules: one Markdown file each, in
 * `skills/.loadout-items/<kind>/<name>.md`. The files are the truth; nothing about them is kept
 * in the database, so a sync or a hand edit needs no rebuild.
 */
export interface ItemLibrary {
  readonly root: string;
  list(kind?: ItemKind): StoredItem[];
  /** Null when there is no such item. */
  find(kind: ItemKind, name: string): StoredItem | null;
  get(kind: ItemKind, name: string): StoredItem;
  create(kind: ItemKind, name: string, content: string): StoredItem;
  /**
   * Replace the text. Throws CHANGED_ON_DISK when the file is no longer the version `baseHash`
   * names, unless `overwrite`.
   */
  save(
    kind: ItemKind,
    name: string,
    content: string,
    baseHash: string,
    overwrite?: boolean,
  ): StoredItem;
  remove(kind: ItemKind, name: string): void;
}

export function assertItemName(name: string): void {
  const problem = itemNameProblem(name);
  if (problem === null) return;
  throw invalid(
    problem === "empty"
      ? "An item needs a name."
      : problem === "too_long"
        ? `The name "${name}" is too long.`
        : `The name "${name}" can only use lowercase letters, digits, and single hyphens or underscores.`,
  );
}

export function createItemLibrary(skillsDir: string): ItemLibrary {
  const root = join(skillsDir, ITEMS_DIR_NAME);
  const pathOf = (kind: ItemKind, name: string): string =>
    join(skillsDir, ...itemRelativePath(kind, name).split("/"));

  const read = (kind: ItemKind, name: string): StoredItem | null => {
    const path = pathOf(kind, name);
    const stat = statOrNull(path);
    if (!stat?.isFile()) return null;
    const content = readFileSync(path, "utf8");
    return { kind, name, path, content, hash: sha256Hex(content), modifiedAt: stat.mtimeMs };
  };

  const get = (kind: ItemKind, name: string): StoredItem => {
    assertItemName(name);
    const item = read(kind, name);
    if (!item) throw notFound(`No ${kind} called "${name}" in the library.`);
    return item;
  };

  const write = (kind: ItemKind, name: string, content: string): StoredItem => {
    const path = pathOf(kind, name);
    ensureDir(join(root, ITEM_KIND_DIRS[kind]));
    writeFileAtomic(path, content);
    const item = read(kind, name);
    if (!item) throw notFound(`Could not read back ${path}`);
    return item;
  };

  return {
    root,
    list(kind) {
      const kinds = kind ? [kind] : ITEM_KINDS;
      return kinds.flatMap((each) =>
        readDirSafe(join(root, ITEM_KIND_DIRS[each]))
          .filter((entry) => entry.isFile() && entry.name.endsWith(ITEM_FILE_EXTENSION))
          .map((entry) => entry.name.slice(0, -ITEM_FILE_EXTENSION.length))
          .filter((name) => itemNameProblem(name) === null)
          .sort()
          .flatMap((name) => read(each, name) ?? []),
      );
    },
    find: (kind, name) => (itemNameProblem(name) === null ? read(kind, name) : null),
    get,
    create(kind, name, content) {
      assertItemName(name);
      if (read(kind, name)) throw exists(`There is already a ${kind} called "${name}".`);
      return write(kind, name, content);
    },
    save(kind, name, content, baseHash, overwrite = false) {
      const current = get(kind, name);
      if (current.hash !== baseHash && !overwrite) {
        throw new AppError(
          "CHANGED_ON_DISK",
          `${name} changed on disk after it was opened. Reload it, or save again to overwrite.`,
        );
      }
      if (current.content === content) return current;
      return write(kind, name, content);
    },
    remove(kind, name) {
      get(kind, name);
      removePathSync(pathOf(kind, name));
    },
  };
}
