import { join } from "node:path";
import type { AgentRegistry } from "../agents/registry";
import { invalid } from "../errors";
import { type GuardedFolder, guardedFolders, overlappingFolder } from "../projects/overlap";
import { isInside, lstatOrNull, realPathOf } from "../util/fs";
import { holdsUncopiedEntries } from "../util/hash";

/**
 * Where `skills.toml` may write. Both files are committed by other people, so nothing in them is
 * trusted: a folder is only ever written, replaced or removed when it sits directly inside an
 * agent's project skills folder that really lies inside the project, and is none of the agents'
 * own global folders or the library.
 */
export interface FolderRules {
  root: string;
  realRoot: string;
  /** Folders no project folder may be, or be inside, or hold. */
  forbidden: GuardedFolder[];
  /** Every agent's project skills folder, `/` separated. */
  projectDirs: Set<string>;
}

/** `libraryDir`: the library's whole folder, not only its skills. */
export function folderRules(
  root: string,
  registry: AgentRegistry,
  libraryDir: string,
): FolderRules {
  const agents = registry.list();
  return {
    root,
    realRoot: realPathOf(root),
    forbidden: guardedFolders(libraryDir, registry),
    projectDirs: new Set(
      agents.flatMap((agent) => {
        const dir = agent.projectSkillsDir;
        return dir ? [dir] : [];
      }),
    ),
  };
}

/** Why a project skills folder must not be written in; null when it is fine. */
function refusal(rules: FolderRules, dir: string): string | null {
  const real = realPathOf(join(rules.root, dir));
  if (!isInside(rules.realRoot, real) || real === rules.realRoot) {
    return `${dir} leads outside the project (to ${real})`;
  }
  const clash = overlappingFolder(rules.forbidden, real);
  return clash ? `${dir} is, or holds, ${clash.what} (${clash.path})` : null;
}

/** Throw when the file would make Loadout write into `dir` (a project skills folder). */
export function checkProjectDir(rules: FolderRules, dir: string): void {
  const reason = refusal(rules, dir);
  if (reason) throw invalid(`Not applied: ${reason}. Nothing was changed.`);
}

/**
 * The path of a folder the lock lists, when it is a skill folder right inside an agent's safe
 * project skills folder; null for anything else, which is then never touched.
 */
export function lockFolderPath(rules: FolderRules, folder: string): string | null {
  const cut = folder.lastIndexOf("/");
  const dir = folder.slice(0, cut);
  const name = folder.slice(cut + 1);
  if (cut <= 0 || !rules.projectDirs.has(dir)) return null;
  if (!name || name === "." || name === ".." || /[\\/]/.test(name)) return null;
  return refusal(rules, dir) ? null : join(rules.root, dir, name);
}

/**
 * A real folder (not a link or a file) holding nothing its fingerprint cannot see, such as `.git`
 * or links. Only such a folder may be replaced or removed: equal fingerprints then mean equal
 * content, and a copy of it can go to Recently removed.
 */
export function isPlainFolder(path: string): boolean {
  const stat = lstatOrNull(path);
  return stat !== null && stat.isDirectory() && !holdsUncopiedEntries(path);
}
