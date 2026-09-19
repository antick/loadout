import { existsSync, readFileSync, readdirSync, renameSync } from "node:fs";
import { cpSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  APP_SLUG,
  LIBRARY_DIR_NAME,
  type LibraryLocation,
  type LibraryWarning,
} from "@skillboard/shared";
import { errorMessage } from "./errors";
import {
  canonicalPath,
  ensureDir,
  isInside,
  normalizeAbsolutePath,
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
  /** OS config folder override (tests). */
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
const CONFIG_FILE = "library.json";
const METADATA_DIR = `.${APP_SLUG}`;

export function osConfigDir(home: string): string {
  if (process.platform === "darwin") return join(home, "Library", "Application Support");
  if (process.platform === "win32") return process.env.APPDATA ?? join(home, "AppData", "Roaming");
  return process.env.XDG_CONFIG_HOME ?? join(home, ".config");
}

function buildPaths(baseDir: string, defaultBaseDir: string, configPath: string): LibraryPaths {
  const skillsDir = join(baseDir, "skills");
  return {
    defaultBaseDir,
    baseDir,
    skillsDir,
    metadataDir: join(skillsDir, METADATA_DIR),
    cacheDir: join(baseDir, "cache"),
    logsDir: join(baseDir, "logs"),
    binDir: join(defaultBaseDir, "bin"),
    dbPath: join(baseDir, DB_FILE),
    lockPath: join(baseDir, LOCK_FILE),
    crashMarkerPath: join(baseDir, "logs", CRASH_FILE),
    configPath,
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

function isEmptyOrMissing(path: string): boolean {
  if (!existsSync(path)) return true;
  try {
    return readdirSync(path).length === 0;
  } catch {
    return false;
  }
}

/** Move the library. Returns false when it could not be done safely; the source is then kept. */
function migrate(source: string, target: string, notes: string[]): boolean {
  if (isInside(source, target) || !isEmptyOrMissing(target)) {
    notes.push(`Library move skipped: target ${target} is inside the source or not empty`);
    return false;
  }
  try {
    ensureDir(dirname(target));
    if (existsSync(target)) readdirSync(target);
    try {
      renameSync(source, target);
    } catch {
      cpSync(source, target, { recursive: true });
    }
    return true;
  } catch (error) {
    notes.push(`Library move failed: ${errorMessage(error)}`);
    return false;
  }
}

/** Work out where the library lives, finishing a pending move when one is queued. Never throws. */
export function resolveLibrary(options: ResolveOptions = {}): ResolvedLibrary {
  const home = options.homeDir ?? homedir();
  const defaultBaseDir = join(home, LIBRARY_DIR_NAME);
  const configPath = join(options.configDir ?? osConfigDir(home), APP_SLUG, CONFIG_FILE);
  const warnings: LibraryWarning[] = [];
  const notes: string[] = [];

  if (options.baseDir) {
    return { paths: buildPaths(options.baseDir, defaultBaseDir, configPath), warnings, notes };
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
  if (pending) {
    let keepMarker = false;
    const same = canonicalPath(pending) === canonicalPath(baseDir);
    if (existsSync(pending) && !same && !migrate(pending, baseDir, notes)) {
      warnings.push("migration_incomplete");
      baseDir = pending;
      keepMarker = true;
    }
    if (!keepMarker) {
      writeJsonAtomic(configPath, { libraryPath: config.libraryPath, pendingMigrationFrom: null });
    }
  }

  return {
    paths: buildPaths(baseDir, defaultBaseDir, configPath),
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
