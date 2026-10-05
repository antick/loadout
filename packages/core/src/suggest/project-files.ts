import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import { GIT_DIR, readDirSafe, readTextOrNull } from "../util/fs";
import { DEPENDENCY_DIRS } from "../util/skipped-dirs";

/** What a project holds, as far as suggestions care. */
export interface ProjectFiles {
  /** Files and folders, relative and `/` separated. */
  paths: string[];
  /** Dependency names from its package lists, lower case. */
  packages: Set<string>;
}

const MAX_DEPTH = 4;
/** A huge tree is cut short: the top of a project tells enough. */
const MAX_PATHS = 5000;
/** Folders that hold dependencies, builds or tool state, not the project's own files. */
const SKIPPED_DIRS: ReadonlySet<string> = new Set([
  ...DEPENDENCY_DIRS,
  GIT_DIR,
  "dist",
  "build",
  "out",
  ".next",
  ".turbo",
  ".venv",
  "venv",
  ".cache",
]);
const PACKAGE_JSON = "package.json";
const REQUIREMENTS = "requirements.txt";
const PYPROJECT = "pyproject.toml";
const GEMFILE = "Gemfile";
const JS_DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies"] as const;
/** The name at the start of a requirement line: `django>=4`, `fastapi[all]`. */
const REQUIREMENT_NAME = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/;
const GEM_LINE = /^\s*gem\s+["']([^"']+)["']/;

function jsPackages(text: string): string[] {
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    return JS_DEPENDENCY_FIELDS.flatMap((field) => {
      const deps = json[field];
      return deps && typeof deps === "object" ? Object.keys(deps) : [];
    });
  } catch {
    return [];
  }
}

function requirementName(line: string): string[] {
  const name = REQUIREMENT_NAME.exec(line)?.[1];
  return name ? [name] : [];
}

function pythonPackages(text: string): string[] {
  try {
    const toml = parseToml(text) as {
      project?: { dependencies?: unknown };
      tool?: { poetry?: { dependencies?: unknown } };
    };
    const listed = Array.isArray(toml.project?.dependencies) ? toml.project.dependencies : [];
    const poetry = toml.tool?.poetry?.dependencies;
    return [
      ...listed
        .filter((entry): entry is string => typeof entry === "string")
        .flatMap(requirementName),
      ...(poetry && typeof poetry === "object" ? Object.keys(poetry) : []),
    ];
  } catch {
    return [];
  }
}

function packagesIn(name: string, text: string): string[] {
  switch (name) {
    case PACKAGE_JSON:
      return jsPackages(text);
    case REQUIREMENTS:
      return text.split("\n").flatMap(requirementName);
    case PYPROJECT:
      return pythonPackages(text);
    case GEMFILE:
      return text.split("\n").flatMap((line) => {
        const gem = GEM_LINE.exec(line)?.[1];
        return gem ? [gem] : [];
      });
    default:
      return [];
  }
}

const PACKAGE_FILES: ReadonlySet<string> = new Set([
  PACKAGE_JSON,
  REQUIREMENTS,
  PYPROJECT,
  GEMFILE,
]);

/** Walk `root` a few levels down, skipping dependency and build folders. */
export function readProjectFiles(root: string): ProjectFiles {
  const paths: string[] = [];
  const packages = new Set<string>();
  const walk = (dir: string, prefix: string, depth: number): void => {
    for (const entry of readDirSafe(dir)) {
      if (paths.length >= MAX_PATHS) return;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (SKIPPED_DIRS.has(entry.name)) continue;
        paths.push(path);
        if (depth < MAX_DEPTH) walk(join(dir, entry.name), path, depth + 1);
      } else if (entry.isFile()) {
        paths.push(path);
        if (PACKAGE_FILES.has(entry.name)) {
          const text = readTextOrNull(join(dir, entry.name));
          for (const name of text ? packagesIn(entry.name, text) : []) {
            packages.add(name.toLowerCase());
          }
        }
      }
    }
  };
  walk(root, "", 1);
  return { paths, packages };
}
