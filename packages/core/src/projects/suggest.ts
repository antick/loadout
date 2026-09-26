import { readFileSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProjectSuggestion, ProjectSuggestionSource } from "@loadout/shared";
import { canonicalPath, isDirectory, isInside, readDirSafe, statOrNull } from "../util/fs";

/**
 * Projects the user already works in, found without asking: Claude Code's list of projects, the
 * recent folders of VS Code-style editors, and Git repositories in the usual code folders. Runs
 * only when asked for. Folders macOS guards are listed from the histories without being opened,
 * because opening one would make macOS ask for access out of the blue.
 */

export interface SuggestProjectsInput {
  homeDir: string;
  /** Where apps keep their settings (`~/Library/Application Support` on macOS). */
  configDir: string;
  platform: NodeJS.Platform;
  /** Every project-relative skills folder an agent uses. */
  skillFolders: readonly string[];
  /** Folders never suggested, nor anything inside them: linked projects, the library. */
  exclude: readonly string[];
}

const CLAUDE_STATE_FILE = ".claude.json";
/** Claude Code keeps each project's sessions in a folder named after the project's path. */
const CLAUDE_SESSIONS_DIR = join(".claude", "projects");
/** VS Code and its forks keep recent folders as `file://` URIs in this file. */
const EDITOR_STORAGE_FILE = join("User", "globalStorage", "storage.json");
const EDITORS: readonly { source: ProjectSuggestionSource; appDir: string }[] = [
  { source: "cursor", appDir: "Cursor" },
  { source: "vscode", appDir: "Code" },
  { source: "windsurf", appDir: "Windsurf" },
];
const FILE_URI_PATTERN = /file:\/\/[^"\s]+/g;
const WORKSPACE_FILE_SUFFIX = ".code-workspace";
/** Folders in the home folder where people keep code; searched two levels deep for `.git`. */
const CODE_FOLDERS = [
  "Projects",
  "projects",
  "Developer",
  "dev",
  "code",
  "Code",
  "src",
  "repos",
  "github",
  "GitHub",
  "work",
  "workspace",
];
const GIT_DIR = ".git";
/** `.git/index` changes with every commit and staging, which makes it a good "last worked on". */
const GIT_ACTIVITY_FILES = ["index", "HEAD"];
const CODE_FOLDER_DEPTH = 2;
/** Folders read while looking for repositories, so a huge code folder cannot stall the dialog. */
const MAX_FOLDER_READS = 400;
const MAX_SUGGESTIONS = 60;
const SKIPPED_FOLDERS: ReadonlySet<string> = new Set(["node_modules", "vendor", "target"]);
/** Home folders that hold projects but are not one. */
const CONTAINER_FOLDERS = ["Desktop", "Documents", "Downloads", ...CODE_FOLDERS];
/** Folders macOS asks permission for before an app may look inside. */
const MAC_GUARDED_FOLDERS = [
  "Desktop",
  "Documents",
  "Downloads",
  join("Library", "Mobile Documents"),
  join("Library", "CloudStorage"),
];
const MAC_VOLUMES = "/Volumes";

interface Candidate {
  sources: Set<ProjectSuggestionSource>;
  lastActiveAt: number | null;
}

/** Device and inode: equal for two paths that reach one folder. Null when it is not a folder. */
function folderIdentity(path: string): string | null {
  const stat = statOrNull(path);
  return stat?.isDirectory() ? `${stat.dev}:${stat.ino}` : null;
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function mtimeOf(path: string): number | null {
  const stat = statOrNull(path);
  return stat ? Math.floor(stat.mtimeMs) : null;
}

function latest(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/** `/a/b/` → `/a/b`. Relative paths and the file system root are not projects: null. */
function cleanPath(path: string): string | null {
  const resolved = resolve(path);
  const trimmed = resolved.length > 1 ? resolved.replace(/[\\/]+$/, "") : resolved;
  if (!trimmed || trimmed === sep || /^[A-Za-z]:$/.test(trimmed)) return null;
  return trimmed;
}

/** Claude Code's session folder name for a project: every other character becomes `-`. */
function claudeSessionsName(path: string): string {
  return path.replace(/[^a-zA-Z0-9]/g, "-");
}

function fromClaudeCode(homeDir: string): Map<string, number | null> {
  const found = new Map<string, number | null>();
  const text = readText(join(homeDir, CLAUDE_STATE_FILE));
  if (!text) return found;
  let projects: unknown;
  try {
    projects = (JSON.parse(text) as { projects?: unknown }).projects;
  } catch {
    return found;
  }
  if (!projects || typeof projects !== "object") return found;
  for (const path of Object.keys(projects)) {
    const sessions = join(homeDir, CLAUDE_SESSIONS_DIR, claudeSessionsName(path));
    found.set(path, mtimeOf(sessions));
  }
  return found;
}

function fromEditor(configDir: string, appDir: string): string[] {
  const text = readText(join(configDir, appDir, EDITOR_STORAGE_FILE));
  if (!text) return [];
  const paths: string[] = [];
  for (const uri of text.match(FILE_URI_PATTERN) ?? []) {
    if (uri.endsWith(WORKSPACE_FILE_SUFFIX)) continue;
    try {
      paths.push(fileURLToPath(uri));
    } catch {
      // Not a local path (another host, a malformed entry): skip it.
    }
  }
  return paths;
}

/** Git repositories at most two levels below the usual code folders in the home folder. */
function fromCodeFolders(homeDir: string): string[] {
  const found: string[] = [];
  const visited = new Set<string>();
  let reads = 0;
  const walk = (dir: string, depth: number): void => {
    if (reads >= MAX_FOLDER_READS) return;
    reads += 1;
    for (const entry of readDirSafe(dir)) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      if (SKIPPED_FOLDERS.has(entry.name)) continue;
      const child = join(dir, entry.name);
      if (isDirectory(join(child, GIT_DIR))) found.push(child);
      else if (depth < CODE_FOLDER_DEPTH) walk(child, depth + 1);
    }
  };
  for (const name of CODE_FOLDERS) {
    const root = join(homeDir, name);
    // `code` and `Code` are one folder on a case-insensitive disk, whatever the path says.
    const identity = folderIdentity(root);
    if (!identity || visited.has(identity)) continue;
    visited.add(identity);
    walk(root, 1);
  }
  return found;
}

function guardedRoots(input: SuggestProjectsInput): string[] {
  if (input.platform !== "darwin") return [];
  return [...MAC_GUARDED_FOLDERS.map((name) => join(input.homeDir, name)), MAC_VOLUMES];
}

/** Suggestions, most recently active first, without the linked projects and the library. */
export function suggestProjects(input: SuggestProjectsInput): ProjectSuggestion[] {
  const candidates = new Map<string, Candidate>();
  const add = (raw: string, source: ProjectSuggestionSource, activity: number | null): void => {
    const path = cleanPath(raw);
    if (!path) return;
    const candidate = candidates.get(path) ?? { sources: new Set(), lastActiveAt: null };
    candidate.sources.add(source);
    candidate.lastActiveAt = latest(candidate.lastActiveAt, activity);
    candidates.set(path, candidate);
  };
  for (const [path, activity] of fromClaudeCode(input.homeDir)) add(path, "claude_code", activity);
  for (const editor of EDITORS) {
    for (const path of fromEditor(input.configDir, editor.appDir)) add(path, editor.source, null);
  }
  for (const path of fromCodeFolders(input.homeDir)) add(path, "git", null);

  const guarded = guardedRoots(input);
  const isGuarded = (path: string): boolean =>
    guarded.some((root) => path === root || isInside(root, path));
  const containers = new Set(
    [input.homeDir, ...CONTAINER_FOLDERS.map((name) => join(input.homeDir, name))].map(
      (path) => cleanPath(path) ?? path,
    ),
  );
  const excluded = input.exclude.flatMap((path) => {
    const clean = cleanPath(path);
    return clean ? [clean] : [];
  });
  // Only folders outside the guarded ones are resolved through links: resolving reads the disk.
  const excludedReal = excluded.filter((path) => !isGuarded(path)).map(canonicalPath);
  const isExcluded = (path: string, real: string | null): boolean =>
    excluded.some((root) => path === root || isInside(root, path)) ||
    (real !== null && excludedReal.some((root) => real === root || isInside(root, real)));

  const suggestions: ProjectSuggestion[] = [];
  const byFolder = new Map<string, ProjectSuggestion>();
  for (const [path, candidate] of candidates) {
    if (containers.has(path)) continue;
    const sources = [...candidate.sources];
    const name = basename(path);
    if (isGuarded(path)) {
      if (isExcluded(path, null)) continue;
      suggestions.push({
        path,
        name,
        sources,
        lastActiveAt: candidate.lastActiveAt,
        skillFolders: [],
        guarded: true,
      });
      continue;
    }
    const identity = folderIdentity(path);
    if (!identity) continue;
    if (isExcluded(path, canonicalPath(path))) continue;
    const same = byFolder.get(identity);
    if (same) {
      // Another spelling of a folder already listed (case, a link): one entry, every source.
      same.sources = [...new Set([...same.sources, ...sources])];
      same.lastActiveAt = latest(same.lastActiveAt, candidate.lastActiveAt);
      continue;
    }
    const gitActivity = GIT_ACTIVITY_FILES.map((file) => mtimeOf(join(path, GIT_DIR, file))).reduce(
      latest,
      null,
    );
    const skillFolders = input.skillFolders.filter((relative) => isDirectory(join(path, relative)));
    const suggestion: ProjectSuggestion = {
      path,
      name,
      sources,
      lastActiveAt: latest(candidate.lastActiveAt, gitActivity),
      skillFolders,
      guarded: false,
    };
    byFolder.set(identity, suggestion);
    suggestions.push(suggestion);
  }

  return suggestions
    .sort(
      (a, b) =>
        (b.lastActiveAt ?? Number.NEGATIVE_INFINITY) -
          (a.lastActiveAt ?? Number.NEGATIVE_INFINITY) || a.name.localeCompare(b.name),
    )
    .slice(0, MAX_SUGGESTIONS);
}
