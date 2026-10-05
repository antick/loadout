import { join } from "node:path";
import type {
  LockedFolder,
  SkillsFileAction,
  SkillsFileEntry,
  SkillsFileInfo,
  SkillsFilePlan,
  SkillsFilePlanSource,
} from "@loadout/shared";
import type { AgentRegistry } from "../agents/registry";
import { invalid } from "../errors";
import type { GitClient } from "../install/git-client";
import type { FoundSkill } from "../install/repo-scan";
import { lstatOrNull } from "../util/fs";
import { type HashOptions, hashDir } from "../util/hash";
import { sanitizeSkillName } from "../util/names";
import { type FetchedSource, chooseSkills, fetchSource } from "./fetch";
import {
  type FolderRules,
  checkProjectDir,
  folderRules,
  isPlainFolder,
  lockFolderPath,
} from "./safety";

/** A folder the file asks for, with what it should hold. */
export interface WantedFolder {
  folder: string;
  path: string;
  skill: FoundSkill;
  url: string;
  hash: string;
  agents: string[];
}

/** Everything `apply` needs; `cleanup` removes the checkouts. */
export interface PreparedPlan {
  plan: SkillsFilePlan;
  wanted: WantedFolder[];
  rules: FolderRules;
  cleanup(): Promise<void>;
}

export interface PrepareOptions {
  /** Follow branches and tags to their newest commit instead of the locked ones. */
  update: boolean;
  /** List folders the file no longer asks for as removals. */
  prune: boolean;
  /** Ask for nothing: every folder the lock lists is a removal (unapply). */
  nothing?: boolean;
}

/** Project-relative skills folder of each agent the file names, and the names it does not know. */
function agentFolders(
  info: SkillsFileInfo,
  registry: AgentRegistry,
): { folders: Map<string, string[]>; unknown: string[] } {
  const folders = new Map<string, string[]>();
  const unknown: string[] = [];
  for (const key of info.spec.agents) {
    const agent = registry.find(key);
    const dir = agent?.projectSkillsDir ?? null;
    if (!dir) {
      unknown.push(key);
      continue;
    }
    folders.set(dir, [...(folders.get(dir) ?? []), key]);
  }
  return { folders, unknown };
}

/**
 * The hash a lock file records. The lock is committed and shared, so the hash must be the same on
 * every system: line endings (Git may turn LF into CRLF on checkout) and the executable bit
 * (Windows has none) are left out.
 */
const LOCK_HASH: HashOptions = { ignoreLineEndings: true, ignoreExecutable: true };

export function lockHash(dir: string): string | null {
  return hashDir(dir, LOCK_HASH);
}

interface Current {
  exists: boolean;
  /** The lock hash of a plain folder; null for anything else. */
  hash: string | null;
  /** The folder holds what the lock recorded, by today's hash or the one older locks hold. */
  matches(locked: LockedFolder): boolean;
}

/** What is at `path` now: nothing, a plain folder with this hash, or something else (null hash). */
function current(path: string): Current {
  if (!lstatOrNull(path)) return { exists: false, hash: null, matches: () => false };
  const hash = isPlainFolder(path) ? lockHash(path) : null;
  return {
    exists: true,
    hash,
    // A lock written before the hash left line endings and the executable bit out.
    matches: (locked) => hash !== null && (locked.hash === hash || locked.hash === hashDir(path)),
  };
}

/**
 * What applying does to a wanted folder, judged by what is on disk right now. A link, a file or
 * a folder holding `.git` is never Loadout's to replace: it counts as changed by hand.
 */
export function actionFor(
  wanted: WantedFolder,
  locked: LockedFolder | undefined,
): SkillsFileAction {
  const now = current(wanted.path);
  if (!now.exists) return "add";
  if (now.hash !== null && now.hash === wanted.hash) return "same";
  if (locked && now.matches(locked)) return "update";
  return "edited";
}

/** What pruning does to a folder the lock lists; null when there is nothing there any more. */
export function removalFor(path: string, locked: LockedFolder): SkillsFileAction | null {
  const now = current(path);
  if (!now.exists) return null;
  return now.matches(locked) ? "remove" : "keep_edited";
}

/**
 * Fetch every source (at its locked commit unless updating) and work out what applying does to
 * each folder. Changes nothing on disk except the clone cache.
 */
export async function preparePlan(
  info: SkillsFileInfo,
  deps: { git: GitClient; registry: AgentRegistry; libraryDir: string },
  options: PrepareOptions,
): Promise<PreparedPlan> {
  const { root, spec, lock } = info;
  const rules = folderRules(root, deps.registry, deps.libraryDir);
  const { folders, unknown } = agentFolders(info, deps.registry);
  // Checked before anything is fetched: a folder leading elsewhere stops the whole run.
  if (!options.nothing) for (const dir of folders.keys()) checkProjectDir(rules, dir);
  const fetched: FetchedSource[] = [];
  const cleanup = async (): Promise<void> => {
    for (const source of fetched) await source.cleanup();
  };
  try {
    const sources: SkillsFilePlanSource[] = [];
    const wanted: WantedFolder[] = [];
    const byFolder = new Map<string, string>();
    for (const source of options.nothing ? [] : spec.sources) {
      const locked = lock?.sources.find((s) => s.url === source.url && s.ref === source.ref);
      const revision = options.update ? null : (locked?.revision ?? null);
      const checkout = await fetchSource(deps.git, source, { revision });
      fetched.push(checkout);
      const { chosen, missing } = chooseSkills(checkout.skills, source.skills);
      sources.push({
        url: source.url,
        ref: source.ref,
        revision: checkout.revision,
        moved: locked?.revision !== checkout.revision,
        missing,
      });
      for (const skill of chosen) {
        const name = sanitizeSkillName(skill.name);
        const hash = lockHash(skill.dir);
        if (hash === null) continue;
        for (const [dir, agents] of folders) {
          const folder = `${dir}/${name}`;
          const owner = byFolder.get(folder);
          if (owner !== undefined) {
            throw invalid(
              owner === source.url
                ? `${source.url} holds two skills called ${name}; list the one you want by folder.`
                : `${name} is in both ${owner} and ${source.url}; list it from one only.`,
            );
          }
          byFolder.set(folder, source.url);
          wanted.push({
            folder,
            path: join(root, dir, name),
            skill,
            url: source.url,
            hash,
            agents,
          });
        }
      }
    }

    const lockedFolders = new Map((lock?.folders ?? []).map((entry) => [entry.folder, entry]));
    const entries: SkillsFileEntry[] = wanted.map((item) => ({
      folder: item.folder,
      skill: item.skill.name,
      url: item.url,
      agents: item.agents,
      action: actionFor(item, lockedFolders.get(item.folder)),
    }));
    if (options.prune || options.nothing) {
      const agentsByDir = new Map(folders);
      for (const entry of lock?.folders ?? []) {
        if (byFolder.has(entry.folder)) continue;
        const path = lockFolderPath(rules, entry.folder);
        const action = path ? removalFor(path, entry) : null;
        if (!action) continue;
        const dir = entry.folder.slice(0, entry.folder.lastIndexOf("/"));
        entries.push({
          folder: entry.folder,
          skill: entry.folder.slice(entry.folder.lastIndexOf("/") + 1),
          url: entry.url,
          agents: agentsByDir.get(dir) ?? [],
          action,
        });
      }
    }
    return { plan: { root, sources, entries, unknownAgents: unknown }, wanted, rules, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
