import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  REMOVED_KEEP_DAYS,
  type RemovedFolder,
  type RemovedReason,
  type RestoreRemovedResult,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { rowsAtPath } from "../deploy/evidence";
import { exists, notFound } from "../errors";
import type { SkillStore } from "../skills/store";
import {
  dirSize,
  ensureDir,
  isDirectory,
  lstatOrNull,
  moveEntrySync,
  readDirSafe,
  removePathSync,
  statOrNull,
  writeJsonAtomic,
} from "../util/fs";
import { hashDir } from "../util/hash";
import {
  type LibraryRecord,
  isLibraryRecord,
  libraryPathOf,
  restoreLibraryRow,
} from "./removed-library";

const CONTENT_DIR = "content";
const META_FILE = "removed.json";
const DAY_MS = 24 * 60 * 60 * 1000;
const KEEP_MS = REMOVED_KEEP_DAYS * DAY_MS;
/**
 * An entry missing its content or its JSON is either left from a crash or still being written by
 * another process (a copy across disks can take a while): only clear it once it is this old.
 */
const HALF_WRITTEN_GRACE_MS = 60 * 60 * 1000;
/** Entry folders are named by `randomUUID`; anything else is refused before it becomes a path. */
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** What the entry remembers besides the folder itself. */
interface RemovedMeta {
  id: string;
  name: string;
  originalPath: string;
  place: string;
  reason: RemovedReason;
  removedAt: number;
  /** Set when a library skill was deleted: what a restore needs to bring the skill back. */
  library?: LibraryRecord;
}

export interface SetAsideInfo {
  /** Where it lives, in words: an agent, or a project and its agent. */
  place: string;
  reason: RemovedReason;
  /** Where it lived when `path` is a temporary spot it was already moved to. Defaults to `path`. */
  originalPath?: string;
  /** The library skill this folder was, when it is deleted from the library. */
  library?: LibraryRecord;
}

/**
 * Recently removed: skill folders Loadout takes out of agent and project folders on the user's
 * word (replaced by the library version, or deleted), kept for `REMOVED_KEEP_DAYS` so they can
 * be put back. One folder per entry: the content as it was, and a small JSON file.
 */
export interface RemovedStore {
  /**
   * Move the folder at `path` into Recently removed. Null when there is nothing worth keeping
   * (nothing there, a link, a file, an empty folder); the caller then removes it as before.
   */
  setAside(path: string, info: SetAsideInfo): string | null;
  list(): RemovedFolder[];
  restore(id: string): Promise<RestoreRemovedResult>;
  remove(id: string): void;
  /** Delete every entry. Returns the bytes freed. */
  clear(): Promise<number>;
  /**
   * Undo a `setAside` whose follow-up failed: the folder goes straight back, when its place is
   * still free, with no trace in the activity history.
   */
  putBack(id: string): void;
  /** The kept folder of an entry, e.g. to show it in the file manager. */
  contentPath(id: string): string;
}

function isMeta(value: unknown): value is RemovedMeta {
  if (typeof value !== "object" || value === null) return false;
  const meta = value as Record<string, unknown>;
  return (
    typeof meta.id === "string" &&
    typeof meta.name === "string" &&
    typeof meta.originalPath === "string" &&
    typeof meta.place === "string" &&
    (meta.reason === "replaced" || meta.reason === "deleted") &&
    typeof meta.removedAt === "number" &&
    (meta.library === undefined || isLibraryRecord(meta.library))
  );
}

export function createRemovedStore(ctx: CoreContext, deps: { store: SkillStore }): RemovedStore {
  const root = (): string => ctx.paths.removedDir;
  const entryDir = (id: string): string => {
    if (!ID_PATTERN.test(id)) throw notFound(`No removed folder with id ${id}`);
    return join(root(), id);
  };

  function readMeta(id: string): RemovedMeta | null {
    const dir = join(root(), id);
    try {
      const meta: unknown = JSON.parse(readFileSync(join(dir, META_FILE), "utf8"));
      return isMeta(meta) && meta.id === id && existsSync(join(dir, CONTENT_DIR)) ? meta : null;
    } catch {
      return null;
    }
  }

  /** Where the entry goes back to: a library skill returns to the library as it is now. */
  const targetOf = (meta: RemovedMeta): string =>
    meta.library ? libraryPathOf(ctx, meta.library) : meta.originalPath;

  function requireMeta(id: string): RemovedMeta {
    entryDir(id);
    const meta = readMeta(id);
    if (!meta) throw notFound("That folder is no longer in Recently removed");
    return meta;
  }

  /** Entries past their time go for good; so do half-written ones, once surely abandoned. */
  function prune(now = Date.now()): void {
    for (const entry of readDirSafe(root())) {
      if (!entry.isDirectory()) continue;
      const dir = join(root(), entry.name);
      const meta = ID_PATTERN.test(entry.name) ? readMeta(entry.name) : null;
      const stale = meta
        ? meta.removedAt + KEEP_MS <= now
        : (statOrNull(dir)?.mtimeMs ?? 0) + HALF_WRITTEN_GRACE_MS <= now;
      if (stale) removePathSync(dir);
    }
  }

  /** Across disks, a source that cannot be fully removed after copying stays, and is logged. */
  const moveOptions = (from: string) => ({
    onLeftover: (error: unknown) =>
      ctx.log.warn(`Copied ${from}, but could not remove all of the original`, error),
  });

  function setAside(path: string, info: SetAsideInfo): string | null {
    const stat = lstatOrNull(path);
    if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) return null;
    if (readDirSafe(path).length === 0) return null;
    prune();
    const id = randomUUID();
    const dir = join(root(), id);
    const originalPath = info.originalPath ?? path;
    const meta: RemovedMeta = {
      id,
      name: basename(originalPath),
      originalPath,
      place: info.place,
      reason: info.reason,
      removedAt: Date.now(),
      ...(info.library ? { library: info.library } : {}),
    };
    // Where it came from is written first: a crash mid-move then leaves nothing unexplained.
    ensureDir(dir);
    writeJsonAtomic(join(dir, META_FILE), meta);
    try {
      moveEntrySync(path, join(dir, CONTENT_DIR), moveOptions(path));
    } catch (error) {
      // Nothing was removed from `path`: a rename moves all or nothing, and a copy that failed
      // never reached the step that removes the original.
      removePathSync(dir);
      throw error;
    }
    ctx.log.info(`Put ${originalPath} aside in Recently removed (${info.reason})`);
    return id;
  }

  /**
   * Clear the path for a restore (the caller drops the deployment rows there: the restored
   * folder is the user's own, not a deployment). A link, or a folder that is
   * exactly a library skill or what one of our rows copied there, holds nothing of the user's
   * and is removed. Any other folder is put aside in turn.
   */
  function clearWay(meta: RemovedMeta): string | null {
    const path = meta.originalPath;
    const stat = lstatOrNull(path);
    if (!stat) return null;
    const rows = rowsAtPath(deps.store.deployments(), path);
    if (stat.isSymbolicLink()) {
      removePathSync(path);
      return null;
    }
    if (!stat.isDirectory())
      throw exists(`A file is in the way: ${path}. Move it, then try again.`);
    const hash = hashDir(path);
    const pristineCopy =
      hash !== null &&
      (rows.some((row) => row.sourceHash === hash) ||
        deps.store.list().some((skill) => skill.contentHash === hash));
    const displaced = pristineCopy
      ? null
      : setAside(path, { place: meta.place, reason: "replaced" });
    if (displaced === null) removePathSync(path);
    return displaced;
  }

  /**
   * A deleted library skill goes back as the same skill: its folder, and its row with its tags
   * and presets. A skill that took its folder name since is never put aside for it: the user
   * chooses which one to keep.
   */
  function restoreToLibrary(meta: RemovedMeta, record: LibraryRecord): RestoreRemovedResult {
    const target = libraryPathOf(ctx, record);
    if (lstatOrNull(target)) {
      throw exists(
        `A skill folder named ${record.dirName} is in the library now. Rename or delete that skill, then restore this one.`,
      );
    }
    ensureDir(ctx.paths.skillsDir);
    const content = join(entryDir(meta.id), CONTENT_DIR);
    moveEntrySync(content, target, moveOptions(content));
    try {
      restoreLibraryRow(ctx, deps.store, record, target);
    } catch (error) {
      // A folder without its row would show up as a stray folder: it goes back to the entry.
      moveEntrySync(target, content, moveOptions(target));
      throw error;
    }
    removePathSync(entryDir(meta.id));
    ctx.activity.record("restore", record.name, "Library: put back from Recently removed");
    ctx.touched("skills", "presets");
    return { path: target, displacedId: null };
  }

  return {
    setAside,

    list: () => {
      prune();
      const now = Date.now();
      return readDirSafe(root())
        .flatMap((entry) => {
          const meta = entry.isDirectory() ? readMeta(entry.name) : null;
          if (!meta) return [];
          const target = targetOf(meta);
          return [
            {
              id: meta.id,
              name: meta.name,
              originalPath: target,
              place: meta.place,
              reason: meta.reason,
              removedAt: meta.removedAt,
              expiresAt: meta.removedAt + KEEP_MS,
              bytes: dirSize(join(root(), meta.id, CONTENT_DIR)),
              occupied: lstatOrNull(target) !== null,
              parentMissing: !isDirectory(dirname(target)),
              library: meta.library !== undefined,
            } satisfies RemovedFolder,
          ];
        })
        .filter((entry) => entry.expiresAt > now)
        .sort((a, b) => b.removedAt - a.removedAt);
    },

    restore: (id) =>
      ctx.lock.run("restore a removed folder", () => {
        const meta = requireMeta(id);
        if (meta.library) return restoreToLibrary(meta, meta.library);
        const parent = dirname(meta.originalPath);
        if (!isDirectory(parent)) {
          throw notFound(`The folder it came from is gone: ${parent}`);
        }
        const displacedId = clearWay(meta);
        // A row left pointing here would claim the restored folder as a deployment.
        for (const row of rowsAtPath(deps.store.deployments(), meta.originalPath)) {
          deps.store.deleteDeployment(row.skillId, row.agentKey);
        }
        const content = join(entryDir(id), CONTENT_DIR);
        moveEntrySync(content, meta.originalPath, moveOptions(content));
        removePathSync(entryDir(id));
        ctx.activity.record("restore", meta.name, `${meta.place}: put back from Recently removed`);
        ctx.touched("skills", "projects");
        return { path: meta.originalPath, displacedId };
      }),

    putBack: (id) => {
      const meta = requireMeta(id);
      const target = targetOf(meta);
      if (lstatOrNull(target)) return;
      const content = join(entryDir(id), CONTENT_DIR);
      moveEntrySync(content, target, moveOptions(content));
      removePathSync(entryDir(id));
    },

    remove: (id) => {
      requireMeta(id);
      removePathSync(entryDir(id));
    },

    clear: () =>
      ctx.lock.run("clear recently removed", () => {
        const size = isDirectory(root()) ? dirSize(root()) : 0;
        removePathSync(root());
        return size;
      }),

    contentPath: (id) => join(entryDir(requireMeta(id).id), CONTENT_DIR),
  };
}
