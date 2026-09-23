import { cpSync, existsSync, readdirSync, readlinkSync, rmSync, rmdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { LIBRARY_CONFIG_FILE } from "@loadout/shared";
import { SECRETS_FILE, SINGLETON_LOCK_FILE, WEB_STORAGE_DIR, WINDOW_STATE_FILE } from "./constants";

/**
 * The app's own files used to live in the OS app data folder (`~/Library/Application Support/…`
 * on macOS). They now live in `~/.loadout/app`. What is worth keeping is copied over once; the
 * old folder is removed afterwards, when nothing can be lost by it.
 */

/** What the old folder holds that the app still needs; the rest is Chromium cache. */
export const CARRIED_ENTRIES: readonly string[] = [
  SECRETS_FILE,
  WINDOW_STATE_FILE,
  WEB_STORAGE_DIR,
];

export interface AppDataMove {
  /** Entries copied into the new folder. */
  copied: string[];
  failed: { name: string; message: string }[];
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Copy what the new folder is missing. Never overwrites anything already there. */
export function adoptAppData(from: string, to: string): AppDataMove {
  const move: AppDataMove = { copied: [], failed: [] };
  if (from === to || !existsSync(from)) return move;
  for (const name of CARRIED_ENTRIES) {
    const source = join(from, name);
    const target = join(to, name);
    if (!existsSync(source) || existsSync(target)) continue;
    try {
      cpSync(source, target, { recursive: true });
      move.copied.push(name);
    } catch (error) {
      move.failed.push({ name, message: messageOf(error) });
    }
  }
  return move;
}

/** Another app instance still runs from `dir`: its lock names a live process. */
function inUse(dir: string, isAlive: (pid: number) => boolean): boolean {
  try {
    const target = readlinkSync(join(dir, SINGLETON_LOCK_FILE));
    const pid = Number(target.slice(target.lastIndexOf("-") + 1));
    return Number.isInteger(pid) && pid > 0 && isAlive(pid);
  } catch {
    return false;
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export type OldAppDataOutcome = "removed" | "absent" | "kept_in_use" | "kept_unsaved" | "failed";

/**
 * Remove the old folder once everything worth keeping is in the new one. Kept when another
 * instance still runs from it, when an entry did not make it across, or when it still holds the
 * library location file (the library has not picked it up yet).
 */
export function removeOldAppData(
  from: string,
  to: string,
  isAlive: (pid: number) => boolean = processAlive,
): OldAppDataOutcome {
  if (from === to || !existsSync(from)) return "absent";
  if (inUse(from, isAlive)) return "kept_in_use";
  const unsaved = CARRIED_ENTRIES.some(
    (name) => existsSync(join(from, name)) && !existsSync(join(to, name)),
  );
  if (unsaved || existsSync(join(from, LIBRARY_CONFIG_FILE))) return "kept_unsaved";
  try {
    rmSync(from, { recursive: true, force: true });
  } catch {
    return "failed";
  }
  // The development build's folder sits in a scope folder of its own (`@loadout/desktop`).
  const parent = dirname(from);
  try {
    if (readdirSync(parent).length === 0) rmdirSync(parent);
  } catch {
    // Not ours to worry about.
  }
  return "removed";
}
