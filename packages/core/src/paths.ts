import { existsSync, readFileSync, readdirSync, renameSync, rmdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  LIBRARY_SKILLS_DIR_NAME,
  APP_DATA_DIR_NAME,
  APP_RUNNING_FILE,
  APP_SLUG,
  CLI_BIN_DIR_NAME,
  DEV_APP_DATA_DIR_NAME,
  LIBRARY_CONFIG_FILE,
  LIBRARY_DIR_NAME,
  REMOVED_DIR_NAME,
  type LibraryLocation,
  type LibraryWarning,
} from "@loadout/shared";
import { errorMessage } from "./errors";
import { RepoLock, writerGone } from "./lock";
import {
  canonicalPath,
  copyEntrySync,
  ensureDir,
  moveEntrySync,
  normalizeAbsolutePath,
  pathsOverlap,
  removePathSync,
  writeJsonAtomic,
} from "./util/fs";

/** Every folder and file the library owns. */
export interface LibraryPaths {
  /** Where things other programs must find always live, even when the library is moved. */
  defaultBaseDir: string;
  baseDir: string;
  /** One folder per skill. Also the root of the backup Git repository. */
  skillsDir: string;
  /** Portable metadata that travels with a backup. */
  metadataDir: string;
  cacheDir: string;
  /** Earlier versions of files the editor overwrote. Stays on this computer. */
  historyDir: string;
  /** Skill folders put aside from agent and project folders (Recently removed). This computer only. */
  removedDir: string;
  /** Whole libraries set aside by a restore or recovery from a backup. This computer only. */
  earlierDir: string;
  logsDir: string;
  binDir: string;
  dbPath: string;
  lockPath: string;
  crashMarkerPath: string;
  configPath: string;
}

interface LocationConfig {
  libraryPath: string | null;
  pendingMigrationFrom: string | null;
}

export interface ResolveOptions {
  homeDir?: string;
  /** Use this base folder and skip the saved location entirely (CLI `--library`, tests). */
  baseDir?: string;
  /**
   * Carry out a library move queued for the next start. Never while the desktop app is open in
   * another process: the library would move out from under it.
   */
  migrate?: boolean;
}

export interface ResolvedLibrary {
  paths: LibraryPaths;
  warnings: LibraryWarning[];
  /** Details for the log, flushed once logging is up. */
  notes: string[];
  /**
   * The saved library is in a folder that is not there (a disk that is not connected). Nothing
   * may be opened or created in its place; `paths` point at where it should be.
   */
  unavailable: boolean;
}

const DB_FILE = `${APP_SLUG}.db`;
const LOCK_FILE = `.${APP_SLUG}.lock`;
const CRASH_FILE = "last-crash.json";
const METADATA_DIR = `.${APP_SLUG}`;
const SKILLS_DIR = LIBRARY_SKILLS_DIR_NAME;
const CACHE_DIR = "cache";
const HISTORY_DIR = "history";
const REMOVED_DIR = REMOVED_DIR_NAME;
const EARLIER_DIR = "earlier-libraries";
const LOGS_DIR = "logs";

/** What the library is made of. Only these move when the library moves. */
const LIBRARY_ENTRIES: readonly string[] = [
  SKILLS_DIR,
  DB_FILE,
  `${DB_FILE}-wal`,
  `${DB_FILE}-shm`,
  HISTORY_DIR,
  REMOVED_DIR,
  EARLIER_DIR,
  CACHE_DIR,
  LOGS_DIR,
];

/** What stays in the home data folder wherever the library is. */
const HOME_ENTRIES: ReadonlySet<string> = new Set([
  LIBRARY_CONFIG_FILE,
  CLI_BIN_DIR_NAME,
  APP_DATA_DIR_NAME,
  DEV_APP_DATA_DIR_NAME,
  LOCK_FILE,
]);

export function osConfigDir(home: string): string {
  if (process.platform === "darwin") return join(home, "Library", "Application Support");
  if (process.platform === "win32") return process.env.APPDATA ?? join(home, "AppData", "Roaming");
  return process.env.XDG_CONFIG_HOME ?? join(home, ".config");
}

function buildPaths(baseDir: string, defaultBaseDir: string): LibraryPaths {
  const skillsDir = join(baseDir, SKILLS_DIR);
  return {
    defaultBaseDir,
    baseDir,
    skillsDir,
    metadataDir: join(skillsDir, METADATA_DIR),
    cacheDir: join(baseDir, CACHE_DIR),
    historyDir: join(baseDir, HISTORY_DIR),
    removedDir: join(baseDir, REMOVED_DIR),
    earlierDir: join(baseDir, EARLIER_DIR),
    logsDir: join(baseDir, LOGS_DIR),
    binDir: join(defaultBaseDir, CLI_BIN_DIR_NAME),
    dbPath: join(baseDir, DB_FILE),
    lockPath: join(baseDir, LOCK_FILE),
    crashMarkerPath: join(baseDir, LOGS_DIR, CRASH_FILE),
    configPath: join(defaultBaseDir, LIBRARY_CONFIG_FILE),
  };
}

/** The saved location config; `warnings` and `notes`, when given, hear about an unreadable file. */
function readConfig(
  configPath: string,
  warnings?: LibraryWarning[],
  notes?: string[],
): LocationConfig {
  const empty: LocationConfig = { libraryPath: null, pendingMigrationFrom: null };
  if (!existsSync(configPath)) return empty;
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as Partial<LocationConfig>;
    return {
      libraryPath: typeof parsed.libraryPath === "string" ? parsed.libraryPath : null,
      pendingMigrationFrom:
        typeof parsed.pendingMigrationFrom === "string" ? parsed.pendingMigrationFrom : null,
    };
  } catch (error) {
    warnings?.push("config_unreadable");
    notes?.push(`Library config unreadable: ${errorMessage(error)}`);
    return empty;
  }
}

/** A move may only fill a folder that holds nothing of its own (the home folder's files aside). */
function canReceive(target: string, defaultBaseDir: string): boolean {
  if (!existsSync(target)) return true;
  try {
    const entries = readdirSync(target);
    const isHome = canonicalPath(target) === canonicalPath(defaultBaseDir);
    return entries.every((name) => isHome && HOME_ENTRIES.has(name));
  } catch {
    return false;
  }
}

/**
 * Move the library's own entries (skills, database, history, removed, cache, logs) from one folder to
 * another; the home folder's files stay. All or nothing: a failure moves back what was moved.
 * Returns false when it could not be done safely; the source is then kept.
 */
function migrate(source: string, target: string, defaultBaseDir: string, notes: string[]): boolean {
  if (pathsOverlap(canonicalPath(source), canonicalPath(target))) {
    notes.push(`Library move skipped: ${target} and ${source} contain one another`);
    return false;
  }
  if (!canReceive(target, defaultBaseDir)) {
    notes.push(`Library move skipped: ${target} is not empty`);
    return false;
  }
  const entries = LIBRARY_ENTRIES.filter((name) => existsSync(join(source, name)));
  // Renamed entries are gone from the source; copied ones (across disks) are still whole there
  // until every entry has arrived, so a failure can always go back to the untouched source.
  const renamed: string[] = [];
  const copied: string[] = [];
  let current: string | null = null;
  try {
    ensureDir(target);
    for (const name of entries) {
      current = name;
      try {
        renameSync(join(source, name), join(target, name));
        renamed.push(name);
      } catch {
        copyEntrySync(join(source, name), join(target, name));
        copied.push(name);
      }
    }
  } catch (error) {
    notes.push(`Library move failed: ${errorMessage(error)}`);
    // A copy that failed halfway, and the whole copies: the source still has them.
    for (const name of [...copied, ...(current && !renamed.includes(current) ? [current] : [])]) {
      removePathSync(join(target, name));
    }
    for (const name of renamed.toReversed()) {
      try {
        moveEntrySync(join(target, name), join(source, name));
      } catch (rollback) {
        notes.push(`Could not move ${name} back: ${errorMessage(rollback)}`);
      }
    }
    return false;
  }
  // Everything arrived. A source copy that cannot be removed is only a leftover now.
  for (const name of copied) {
    try {
      removePathSync(join(source, name));
    } catch (error) {
      notes.push(`Moved ${name}, but could not remove all of the old copy: ${errorMessage(error)}`);
    }
  }
  // A custom location that is now empty is ours to tidy up; the home folder always stays.
  if (canonicalPath(source) !== canonicalPath(defaultBaseDir)) {
    removePathSync(join(source, LOCK_FILE));
    try {
      rmdirSync(source);
    } catch {
      // Something else lives there too; leave it.
    }
  }
  return true;
}

/** Work out where the library lives, finishing a pending move when one is queued. Never throws. */
export function resolveLibrary(options: ResolveOptions = {}): ResolvedLibrary {
  const home = options.homeDir ?? homedir();
  const defaultBaseDir = join(home, LIBRARY_DIR_NAME);
  const configPath = join(defaultBaseDir, LIBRARY_CONFIG_FILE);
  const warnings: LibraryWarning[] = [];
  const notes: string[] = [];

  if (options.baseDir) {
    return {
      paths: buildPaths(options.baseDir, defaultBaseDir),
      warnings,
      notes,
      unavailable: false,
    };
  }

  const config = readConfig(configPath, warnings, notes);
  let baseDir = defaultBaseDir;
  if (config.libraryPath) {
    try {
      baseDir = normalizeAbsolutePath(config.libraryPath, "Library path");
    } catch {
      warnings.push("library_path_invalid");
    }
  }

  const pending = config.pendingMigrationFrom;
  // The data waiting to move is on a missing disk: keep the marker, open nothing.
  if (pending && !existsSync(pending) && !holdsLibrary(baseDir)) {
    notes.push(`The library to move from ${pending} is not available`);
    return { paths: buildPaths(pending, defaultBaseDir), warnings, notes, unavailable: true };
  }
  // A library moved to another folder must be found there: never start an empty one instead.
  if (!pending && config.libraryPath && !holdsLibrary(baseDir)) {
    notes.push(`The library at ${baseDir} is not available`);
    return { paths: buildPaths(baseDir, defaultBaseDir), warnings, notes, unavailable: true };
  }
  if (pending) {
    let keepMarker = false;
    const same = canonicalPath(pending) === canonicalPath(baseDir);
    if (existsSync(pending) && !same && !options.migrate) {
      // Not moved yet: the data is still where it was.
      return { paths: buildPaths(pending, defaultBaseDir), warnings, notes, unavailable: false };
    }
    if (existsSync(pending) && !same) {
      // Only while nobody works in it: a CLI command mid-sync must not see its folders leave.
      let moved = false;
      const ran = new RepoLock(join(pending, LOCK_FILE)).holdSync("move the library", () => {
        moved = migrate(pending, baseDir, defaultBaseDir, notes);
      });
      if (!ran) {
        notes.push(`Library move waits: ${pending} is in use`);
        return { paths: buildPaths(pending, defaultBaseDir), warnings, notes, unavailable: false };
      }
      if (!moved) {
        warnings.push("migration_incomplete");
        baseDir = pending;
        keepMarker = true;
      }
    }
    if (!keepMarker) {
      writeJsonAtomic(configPath, { libraryPath: config.libraryPath, pendingMigrationFrom: null });
    }
  }

  return {
    paths: buildPaths(baseDir, defaultBaseDir),
    warnings: [...new Set(warnings)],
    notes,
    unavailable: false,
  };
}

/** A library lives in `baseDir`: its database, or at least its skills folder, is there. */
function holdsLibrary(baseDir: string): boolean {
  return isLibraryDir(baseDir) || existsSync(join(baseDir, SKILLS_DIR));
}

/**
 * Point the saved location at `path` (null: the default folder) without moving anything: for a
 * library that is already there, or when the old one cannot be reached.
 */
export function pointLibraryAt(homeDir: string, path: string | null): void {
  const next = path === null ? null : normalizeAbsolutePath(path, "Library path");
  const configPath = join(homeDir, LIBRARY_DIR_NAME, LIBRARY_CONFIG_FILE);
  ensureDir(dirname(configPath));
  writeJsonAtomic(configPath, {
    libraryPath: next,
    pendingMigrationFrom: null,
  } satisfies LocationConfig);
}

/** A library lives in `baseDir`: its database is there. */
export function isLibraryDir(baseDir: string): boolean {
  return existsSync(join(baseDir, DB_FILE));
}

/** The desktop app is open on this computer (its pid file names a live process). */
export function isAppRunning(home: string): boolean {
  return [APP_DATA_DIR_NAME, DEV_APP_DATA_DIR_NAME].some((dir) => {
    try {
      const file = join(home, LIBRARY_DIR_NAME, dir, APP_RUNNING_FILE);
      const pid = Number(readFileSync(file, "utf8"));
      const writtenAt = statSync(file).mtimeMs;
      return Number.isInteger(pid) && pid > 0 && pid !== process.pid && !writerGone(pid, writtenAt);
    } catch {
      return false;
    }
  });
}

export function ensureLibraryDirs(paths: LibraryPaths): void {
  for (const dir of [paths.baseDir, paths.skillsDir, paths.cacheDir, paths.logsDir]) ensureDir(dir);
}

/** Queue a library move for the next launch. `null` goes back to the default location. */
export function setLibraryPath(paths: LibraryPaths, input: string | null): string | null {
  const next = input === null ? null : normalizeAbsolutePath(input, "Library path");
  const config = readConfig(paths.configPath);
  const target = next ?? paths.defaultBaseDir;
  // An earlier unsatisfied move still names where the data really is.
  const from = config.pendingMigrationFrom ?? paths.baseDir;
  writeJsonAtomic(paths.configPath, {
    libraryPath: next,
    pendingMigrationFrom: canonicalPath(from) === canonicalPath(target) ? null : from,
  } satisfies LocationConfig);
  return next;
}

export function describeLocation(paths: LibraryPaths, warnings: LibraryWarning[]): LibraryLocation {
  const config = readConfig(paths.configPath);
  const configured = config.libraryPath ?? paths.defaultBaseDir;
  return {
    path: paths.baseDir,
    defaultPath: paths.defaultBaseDir,
    overridden: paths.baseDir !== paths.defaultBaseDir,
    pendingPath: canonicalPath(configured) === canonicalPath(paths.baseDir) ? null : configured,
    warnings,
  };
}
