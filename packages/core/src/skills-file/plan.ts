import { join, posix } from "node:path";
import type {
  LockedFolder,
  SkillsFileAction,
  SkillsFileEntry,
  SkillsFileInfo,
  SkillsFilePlan,
  SkillsFilePlanSource,
} from "@loadout/shared";
import type { AgentRegistry } from "../agents/registry";
import { normalizeProjectDir } from "../agents/service";
import { invalid } from "../errors";
import type { GitClient } from "../install/git-client";
import type { FoundSkill } from "../install/repo-scan";
import { isInside, lstatOrNull } from "../util/fs";
import { hashDir } from "../util/hash";
import { sanitizeSkillName } from "../util/names";
import { type FetchedSource, chooseSkills, fetchSource } from "./fetch";

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
  cleanup(): Promise<void>;
}

export interface PrepareOptions {
  /** Follow branches and tags to their newest commit instead of the locked ones. */
  update: boolean;
  /** List folders the file no longer asks for as removals. */
  prune: boolean;
  /** Ask for nothing: every folder the lock lists is a removal (unapply). */
  nothing?: boolean;
  allowLocalGitSources?: boolean;
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
    const dir = agent ? normalizeProjectDir(agent.projectSkillsDir) : null;
    if (!dir) {
      unknown.push(key);
      continue;
    }
    folders.set(dir, [...(folders.get(dir) ?? []), key]);
  }
  return { folders, unknown };
}

/** A lock folder is a relative path inside the project, never climbing out: it is untrusted. */
export function safeLockFolder(root: string, folder: string): string | null {
  const clean = folder.split(/[\\/]+/).filter((part) => part && part !== ".");
  if (clean.length < 2 || clean.includes("..") || posix.isAbsolute(folder)) return null;
  const path = join(root, ...clean);
  return isInside(root, path) && path !== root ? path : null;
}

/** What is at `path` now: nothing, a real folder with this hash, or something else (null hash). */
function current(path: string): { exists: boolean; hash: string | null } {
  const stat = lstatOrNull(path);
  if (!stat) return { exists: false, hash: null };
  return { exists: true, hash: stat.isDirectory() ? hashDir(path) : null };
}

function actionFor(wanted: WantedFolder, locked: LockedFolder | undefined): SkillsFileAction {
  const now = current(wanted.path);
  if (!now.exists) return "add";
  if (now.hash === wanted.hash) return "same";
  if (locked && now.hash !== null && now.hash === locked.hash) return "update";
  return "edited";
}

/**
 * Fetch every source (at its locked commit unless updating) and work out what applying does to
 * each folder. Changes nothing on disk except the clone cache.
 */
export async function preparePlan(
  info: SkillsFileInfo,
  deps: { git: GitClient; registry: AgentRegistry },
  options: PrepareOptions,
): Promise<PreparedPlan> {
  const { root, spec, lock } = info;
  const { folders, unknown } = agentFolders(info, deps.registry);
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
      const checkout = await fetchSource(deps.git, source, {
        revision,
        allowLocalPath: options.allowLocalGitSources,
      });
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
        const hash = hashDir(skill.dir);
        if (hash === null) continue;
        for (const [dir, agents] of folders) {
          const folder = `${dir}/${name}`;
          const owner = byFolder.get(folder);
          if (owner !== undefined && owner !== source.url) {
            throw invalid(`${name} is in both ${owner} and ${source.url}; list it from one only.`);
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
        const path = safeLockFolder(root, entry.folder);
        if (!path) continue;
        const now = current(path);
        if (!now.exists) continue;
        const dir = entry.folder.slice(0, entry.folder.lastIndexOf("/"));
        entries.push({
          folder: entry.folder,
          skill: entry.folder.slice(entry.folder.lastIndexOf("/") + 1),
          url: entry.url,
          agents: agentsByDir.get(dir) ?? [],
          action: now.hash === entry.hash ? "remove" : "keep_edited",
        });
      }
    }
    return { plan: { root, sources, entries, unknownAgents: unknown }, wanted, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
