import { cpSync, existsSync, readFileSync, readdirSync, renameSync, rmdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  APP_DATA_DIR_NAME,
  APP_SLUG,
  CLI_BIN_DIR_NAME,
  DEV_APP_DATA_DIR_NAME,
  LIBRARY_CONFIG_FILE,
  LIBRARY_DIR_NAME,
  type LibraryLocation,
  type LibraryWarning,
} from "@loadout/shared";
import { errorMessage } from "./errors";
import {
  canonicalPath,
  ensureDir,
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
  /** OS config folder override (tests): where older versions kept the library location. */
  configDir?: string;
  /** Use this base folder and skip the saved location entirely (CLI `--library`, tests). */
  baseDir?: string;
}

export interface ResolvedLibrary {
  paths: LibraryPaths;
  warnings: LibraryWarning[];
  /** Details for the log, flushed once logging is up. */
  notes: string[];
}

const DB_FILE = `${APP_SLUG}.db`;
const LOCK_FILE = `.${APP_SLUG}.lock`;
const CRASH_FILE = "last-crash.json";
const METADATA_DIR = `.${APP_SLUG}`;
const SKILLS_DIR = "skills";
const CACHE_DIR = "cache";
const HISTORY_DIR = "history";
const LOGS_DIR = "logs";

/** What the library is made of. Only these move when the library moves. */
const LIBRARY_ENTRIES: readonly string[] = [
  SKILLS_DIR,
  DB_FILE,
  `${DB_FILE}-wal`,
  `${DB_FILE}-shm`,
  HISTORY_DIR,
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
    logsDir: join(baseDir, LOGS_DIR),
    binDir: join(defaultBaseDir, CLI_BIN_DIR_NAME),
    dbPath: join(baseDir, DB_FILE),
    lockPath: join(baseDir, LOCK_FILE),
    crashMarkerPath: join(baseDir, LOGS_DIR, CRASH_FILE),
    configPath: join(defaultBaseDir, LIBRARY_CONFIG_FILE),
  };
}

function readConfig(
  configPath: string,
  warnings: LibraryWarning[],
  notes: string[],
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
    warnings.push("config_unreadable");
    notes.push(`Library config unreadable: ${errorMessage(error)}`);
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

/** Move one entry, by rename when possible and by copy across disks. */
function moveEntry(from: string, to: string): void {
  try {
    renameSync(from, to);
  } catch {
    cpSync(from, to, { recursive: true });
    removePathSync(from);
  }
}

/**
 * Move the library's own entries (skills, database, history, cache, logs) from one folder to
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
  const moved: string[] = [];
  try {
    ensureDir(target);
    for (const name of entries) {
      moveEntry(join(source, name), join(target, name));
      moved.push(name);
    }
  } catch (error) {
    notes.push(`Library move failed: ${errorMessage(error)}`);
    for (const name of moved.toReversed()) {
      try {
        moveEntry(join(target, name), join(source, name));
      } catch (rollback) {
        notes.push(`Could not move ${name} back: ${errorMessage(rollback)}`);
      }
    }
    return false;
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

/** Older versions kept the location file in the OS config folder. Bring it home once. */
function adoptLegacyConfig(legacyPath: string, configPath: string, notes: string[]): void {
  if (existsSync(configPath) || !existsSync(legacyPath)) return;
  try {
    ensureDir(dirname(configPath));
    moveEntry(legacyPath, configPath);
    notes.push(`Moved the library location file from ${legacyPath} to ${configPath}`);
  } catch (error) {
    notes.push(`Could not move the library location file: ${errorMessage(error)}`);
  }
}

/** Work out where the library lives, finishing a pending move when one is queued. Never throws. */
export function resolveLibrary(options: ResolveOptions = {}): ResolvedLibrary {
  const home = options.homeDir ?? homedir();
  const defaultBaseDir = join(home, LIBRARY_DIR_NAME);
  const configPath = join(defaultBaseDir, LIBRARY_CONFIG_FILE);
  const warnings: LibraryWarning[] = [];
  const notes: string[] = [];

  if (options.baseDir) {
    return { paths: buildPaths(options.baseDir, defaultBaseDir), warnings, notes };
  }

  const legacyDir = options.configDir ?? osConfigDir(home);
  adoptLegacyConfig(join(legacyDir, APP_SLUG, LIBRARY_CONFIG_FILE), configPath, notes);

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
  if (pending) {
    let keepMarker = false;
    const same = canonicalPath(pending) === canonicalPath(baseDir);
    if (existsSync(pending) && !same && !migrate(pending, baseDir, defaultBaseDir, notes)) {
      warnings.push("migration_incomplete");
      baseDir = pending;
      keepMarker = true;
    }
    if (!keepMarker) {
      writeJsonAtomic(configPath, { libraryPath: config.libraryPath, pendingMigrationFrom: null });
    }
  }

  return {
    paths: buildPaths(baseDir, defaultBaseDir),
    warnings: [...new Set(warnings)],
    notes,
  };
}

export function ensureLibraryDirs(paths: LibraryPaths): void {
  for (const dir of [paths.baseDir, paths.skillsDir, paths.cacheDir, paths.logsDir]) ensureDir(dir);
}

/** Queue a library move for the next launch. `null` goes back to the default location. */
export function setLibraryPath(paths: LibraryPaths, input: string | null): string | null {
  const next = input === null ? null : normalizeAbsolutePath(input, "Library path");
  const config = readConfig(paths.configPath, [], []);
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
  const config = readConfig(paths.configPath, [], []);
  const configured = config.libraryPath ?? paths.defaultBaseDir;
  return {
    path: paths.baseDir,
    defaultPath: paths.defaultBaseDir,
    overridden: paths.baseDir !== paths.defaultBaseDir,
    pendingPath: canonicalPath(configured) === canonicalPath(paths.baseDir) ? null : configured,
    warnings,
  };
}
