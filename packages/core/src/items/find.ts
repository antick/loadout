import { readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import {
  ITEM_KINDS,
  ITEM_TARGETS,
  type FoundItem,
  type ItemFormat,
  type ItemKind,
  type ItemTarget,
  importItem,
  itemNameProblem,
  parseMarkdown,
  textField,
} from "@loadout/shared";
import { canonicalPath, readDirSafe, statOrNull, toPosix } from "../util/fs";
import { sha256Hex } from "../util/hash";
import type { ItemDeploymentStore } from "./deployments";
import type { ItemLibrary } from "./library";
import type { ItemPlacement } from "./placement";

/** Files bigger than this are not subagents, commands or rules. */
const MAX_ITEM_BYTES = 256 * 1024;
/** How deep a repository is searched for item folders. */
const MAX_DEPTH = 6;
/** Item folders may group items in subfolders (`git/commit.md` → `git-commit`). */
const MAX_NESTING = 2;
const SKIPPED_DIRS: ReadonlySet<string> = new Set([".git", "node_modules", "__MACOSX", ".hub"]);
/** Folder names that hold items in the library's (Claude Code's) format in any repository. */
const PLAIN_DIRS: Record<string, ItemKind> = {
  agents: "subagent",
  commands: "command",
  rules: "rule",
};
/** Files next to items that are about them, not items. */
const NOT_ITEMS: ReadonlySet<string> = new Set(["readme.md", "changelog.md", "license.md"]);

/** A folder that holds items of one kind in one format. */
interface ItemFolder {
  dir: string;
  kind: ItemKind;
  format: ItemFormat;
  extension: string;
  agentKey: string | null;
  /** Plain `agents/`-style folders in a repository: only files that look like items count. */
  strict: boolean;
}

/** An item name from a file name: lowercase, with anything else turned into hyphens. */
export function itemNameFrom(stem: string): string | null {
  const name = stem
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/[-_]{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
  return itemNameProblem(name) === null ? name : null;
}

/** Every item file of one folder, with subfolders folded into the name. */
function filesOf(folder: ItemFolder): { path: string; name: string }[] {
  const found: { path: string; name: string }[] = [];
  const walk = (dir: string, prefix: string, depth: number): void => {
    for (const entry of readDirSafe(dir)) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < MAX_NESTING && !entry.name.startsWith(".")) {
          walk(path, `${prefix}${entry.name}-`, depth + 1);
        }
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(folder.extension)) continue;
      if (NOT_ITEMS.has(entry.name.toLowerCase())) continue;
      const size = statOrNull(path)?.size ?? 0;
      if (size === 0 || size > MAX_ITEM_BYTES) continue;
      const name = itemNameFrom(`${prefix}${entry.name.slice(0, -folder.extension.length)}`);
      if (name) found.push({ path, name });
    }
  };
  walk(folder.dir, "", 0);
  return found;
}

/**
 * Item folders inside a folder or repository: each agent's project folder (`.claude/agents`,
 * `.cursor/rules`…) and plain `agents/`, `commands/` and `rules/` folders at any depth.
 */
function folderItemFolders(root: string): ItemFolder[] {
  const folders: ItemFolder[] = [];
  const byProjectDir = ITEM_TARGETS.filter((target) => target.projectDir);
  const visited = new Set<string>();
  const walk = (dir: string, depth: number): void => {
    const real = canonicalPath(dir);
    if (visited.has(real)) return;
    visited.add(real);
    const rel = toPosix(relative(root, dir));
    for (const target of byProjectDir) {
      const suffix = target.projectDir ?? "";
      if (rel === suffix || rel.endsWith(`/${suffix}`)) folders.push(folderOf(dir, target, false));
    }
    const plainKind = PLAIN_DIRS[basename(dir)];
    const hidden = rel.split("/").some((part) => part.startsWith("."));
    if (plainKind && !hidden) {
      folders.push({
        dir,
        kind: plainKind,
        format: "claude",
        extension: ".md",
        agentKey: null,
        strict: true,
      });
    }
    if (depth >= MAX_DEPTH) return;
    for (const entry of readDirSafe(dir)) {
      if (!entry.isDirectory() || SKIPPED_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), depth + 1);
    }
  };
  walk(root, 0);
  return folders;
}

function folderOf(dir: string, target: ItemTarget, isAgentHome: boolean): ItemFolder {
  return {
    dir,
    kind: target.kind,
    format: target.format,
    extension: target.extension,
    agentKey: isAgentHome ? target.agentKey : null,
    strict: false,
  };
}

/** A plain Markdown file counts as an item only when it has frontmatter saying what it does. */
function looksLikeItem(kind: ItemKind, text: string): boolean {
  const { fields } = parseMarkdown(text);
  if (kind === "rule" && fields.paths !== undefined) return true;
  return textField(fields, "description") !== null;
}

export interface ItemFinder {
  /** Items in every installed agent's global folders that Loadout did not put there. */
  inAgents(): FoundItem[];
  /** Items in a folder: a project, a checkout, anything. Paths come back relative to `root`. */
  inFolder(root: string): FoundItem[];
}

export function createItemFinder(deps: {
  library: ItemLibrary;
  placement: ItemPlacement;
  deployments: ItemDeploymentStore;
}): ItemFinder {
  const { library, placement, deployments } = deps;

  const statusOf = (kind: ItemKind, name: string, content: string): FoundItem["status"] => {
    const existing = library.find(kind, name);
    if (!existing) return "new";
    return existing.content.trim() === content.trim() ? "same" : "differs";
  };

  const read = (folders: ItemFolder[], root: string | null): FoundItem[] => {
    const found: FoundItem[] = [];
    const seen = new Set<string>();
    // Items in the library's own format first, so they win a name used twice.
    const ordered = [...folders].sort(
      (a, b) => Number(b.format === "claude") - Number(a.format === "claude"),
    );
    for (const folder of ordered) {
      for (const file of filesOf(folder)) {
        const key = `${folder.kind}/${file.name}`;
        if (seen.has(key)) continue;
        let text: string;
        try {
          text = readFileSync(file.path, "utf8");
        } catch {
          continue;
        }
        // Files Loadout wrote and nobody changed are the library's already.
        const hash = sha256Hex(text);
        if (deployments.atPath(file.path).some((record) => record.writtenHash === hash)) continue;
        if (folder.strict && !looksLikeItem(folder.kind, text)) continue;
        seen.add(key);
        const imported = importItem(folder.format, text);
        found.push({
          kind: folder.kind,
          name: file.name,
          path: root ? toPosix(relative(root, file.path)) : file.path,
          format: folder.format,
          description: textField(parseMarkdown(imported.content).fields, "description"),
          content: imported.content,
          warnings: imported.warnings,
          status: statusOf(folder.kind, file.name, imported.content),
          agentKey: folder.agentKey,
        });
      }
    }
    return found.sort(
      (a, b) =>
        ITEM_KINDS.indexOf(a.kind) - ITEM_KINDS.indexOf(b.kind) || a.name.localeCompare(b.name),
    );
  };

  return {
    inAgents() {
      const folders = ITEM_KINDS.flatMap((kind) =>
        placement.places(kind).flatMap((place) => {
          const target = ITEM_TARGETS.find((t) => t.kind === kind && t.agentKey === place.agentKey);
          return place.installed && place.globalDir && target
            ? [folderOf(place.globalDir, target, true)]
            : [];
        }),
      );
      return read(folders, null);
    },
    inFolder(root) {
      return read(folderItemFolders(root), root);
    },
  };
}
