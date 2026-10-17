import { randomUUID } from "node:crypto";
import { readlinkSync, renameSync, symlinkSync, unlinkSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { copyEntrySync, ensureDir, lstatOrNull, moveEntrySync, removePathSync } from "../util/fs";
import type { Variant } from "./scan";

/** Capture link targets before moving a canonical folder makes its links temporarily dangling. */
export function movedProjectLinks(moves: readonly { variant: Variant; to: string }[]) {
  const destinations = new Map(moves.map(({ variant, to }) => [variant.path, to]));
  return moves.flatMap(({ variant, to }) => {
    if (!lstatOrNull(variant.path)?.isSymbolicLink()) return [];
    const target = resolve(dirname(variant.path), readlinkSync(variant.path));
    const destination = destinations.get(target);
    return destination ? [{ path: to, target: destination }] : [];
  });
}

/** Stage replacement links before any move; undo the moves if a swap fails. */
export function moveProjectCopies(moves: readonly { variant: Variant; to: string }[]): void {
  const links = movedProjectLinks(moves).map((link) => {
    const source = moves.find((move) => move.to === link.path)!.variant.path;
    const suffix = randomUUID();
    return {
      path: link.path,
      target: link.target,
      staged: join(dirname(source), `.loadout-link-${suffix}`),
      backup: join(dirname(source), `.loadout-old-link-${suffix}`),
    };
  });
  const moved: { variant: Variant; to: string }[] = [];
  const swapped: typeof links = [];
  try {
    for (const link of links)
      symlinkSync(relative(dirname(link.path), link.target), link.staged, "dir");
    for (const move of moves) {
      ensureDir(dirname(move.to));
      moveEntrySync(move.variant.path, move.to);
      moved.push(move);
    }
    for (const link of links) {
      renameSync(link.path, link.backup);
      swapped.push(link);
      renameSync(link.staged, link.path);
    }
  } catch (error) {
    // The backups are original symlinks, so rollback needs no permission to create new links.
    for (const link of swapped.toReversed()) {
      removePathSync(link.path);
      renameSync(link.backup, link.path);
    }
    for (const move of moved.toReversed()) moveEntrySync(move.to, move.variant.path);
    throw error;
  } finally {
    for (const link of links) removePathSync(link.staged);
  }
  for (const link of links) removePathSync(link.backup);
}

/** Removing the real folder must not strand other agents' links to it. */
export function preserveLinkedCopies(removedPaths: ReadonlySet<string>, all: Variant[]): void {
  for (const copy of all) {
    if (removedPaths.has(copy.path) || !lstatOrNull(copy.path)?.isSymbolicLink()) continue;
    const link = readlinkSync(copy.path);
    const target = resolve(dirname(copy.path), link);
    if (!removedPaths.has(target)) continue;
    const temporary = join(dirname(copy.path), `.loadout-copy-${randomUUID()}`);
    try {
      copyEntrySync(target, temporary);
      unlinkSync(copy.path);
      try {
        renameSync(temporary, copy.path);
      } catch (error) {
        symlinkSync(link, copy.path, "dir");
        throw error;
      }
    } finally {
      removePathSync(temporary);
    }
  }
}
