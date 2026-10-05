import { basename, join, relative } from "node:path";
import {
  APP_NAME,
  type BrokenSkillFolder,
  type LocalSkill,
  type Skill,
  type SyncStatus,
  type WorkspaceApi,
} from "@loadout/shared";
import type { AgentRegistry, ResolvedAgent } from "../agents/registry";
import type { CoreContext } from "../context";
import type { DeployService } from "../deploy";
import { repointSources, rowsAtPath, samePath } from "../deploy/evidence";
import { errorMessage, exists, invalid, notFound } from "../errors";
import type { SkillStore } from "../skills/store";
import {
  isDirectory,
  listTopLevel,
  lstatOrNull,
  removePath,
  resolveInside,
  toPosix,
} from "../util/fs";
import { hashDir, holdsUncopiedEntries } from "../util/hash";
import { hashAsLibraryCopy } from "../skills/numbered-name";
import { withSharedFolderDuplicates } from "./duplicates";
import { listPluginSkills, withPluginDuplicates } from "./plugins";
import {
  type LocalSyncDeps,
  pushLocalToLibrary,
  readLocalDocument,
  replaceLocalFromLibrary,
  requireLocalSkill,
  toLocalSkill,
} from "./local-actions";
import {
  type BrokenDir,
  type LibraryIndex,
  type LocalEntry,
  agentScanOptions,
  classifySync,
  findLocalSkillDirs,
  indexLibrary,
  matchLibrarySkill,
  scanSkillRoot,
  walkSkillRoot,
} from "./local-scan";

export interface WorkspaceServiceDeps {
  store: SkillStore;
  registry: AgentRegistry;
  deploy: Pick<DeployService, "adopt" | "refreshCopies">;
  install: LocalSyncDeps["install"];
  removed: LocalSyncDeps["removed"];
}

export interface WorkspaceService {
  api: WorkspaceApi;
}

/** What needs the user's attention comes first. */
const STATUS_ORDER: readonly SyncStatus[] = [
  "local_only",
  "local_newer",
  "diverged",
  "library_newer",
  "in_sync",
];

function sortByAttention(skills: LocalSkill[]): LocalSkill[] {
  return [...skills].sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.syncStatus) - STATUS_ORDER.indexOf(b.syncStatus) ||
      a.name.localeCompare(b.name) ||
      a.relativePath.localeCompare(b.relativePath),
  );
}

/** The global workspace: whatever sits in one agent's own skills folder, managed or not. */
export function createWorkspaceService(
  ctx: CoreContext,
  deps: WorkspaceServiceDeps,
): WorkspaceService {
  const { store, registry, deploy } = deps;

  const library = (): LibraryIndex => indexLibrary(store.list(), store.deployments());

  /** A deployment row of this very agent pointing at this very folder. */
  function isDeployedHere(skill: Skill, agent: ResolvedAgent, path: string): boolean {
    const row = store.deployment(skill.id, agent.key);
    return row !== null && samePath(row.targetPath, path);
  }

  function locate(
    agentKey: string,
    relativePath: string,
  ): { agent: ResolvedAgent; entry: LocalEntry; match: Skill | null } {
    const agent = registry.get(agentKey);
    const entry = requireLocalSkill(agent.skillsDir, relativePath);
    return { agent, entry, match: matchLibrarySkill(entry, library(), "strict") };
  }

  /**
   * Turn the local folder into a managed deployment. Deployments always live at
   * `<skills folder>/<library folder name>`; a local folder somewhere else (a namespace folder,
   * another name) is removed afterwards, but only while it still holds exactly what the library
   * now holds, so nothing can be lost.
   */
  async function adoptLocal(skill: Skill, agent: ResolvedAgent, localPath: string): Promise<void> {
    const target = join(agent.skillsDir, skill.dirName);
    const inPlace = samePath(target, localPath);
    if (!inPlace && lstatOrNull(target)) {
      const ours = rowsAtPath(store.deployments(), target).some((row) => row.skillId === skill.id);
      if (!ours) throw exists(`Cannot take over "${skill.name}": ${target} already exists`);
    }
    repointSources(store, localPath);
    await deploy.adopt(skill, agent);
    if (inPlace) return;
    await ctx.lock.run(`adopt ${skill.name}`, async () => {
      const current = store.get(skill.id);
      // The library copy of a `<name>-N` skill differs only by the name in its SKILL.md.
      if (hashAsLibraryCopy(localPath, current.dirName) !== current.contentHash) {
        ctx.log.warn(`Kept ${localPath}: it changed while it was being adopted`);
        return;
      }
      // Same skill content, but a `.git` folder or links the library copy left out: keep them.
      const kept = holdsUncopiedEntries(localPath)
        ? deps.removed.setAside(localPath, { place: agent.displayName, reason: "replaced" })
        : null;
      if (!kept) await removePath(localPath);
    });
  }

  /**
   * A new skill whose upload could not finish: while the agent's folder still holds exactly the
   * same skill, the library copy is only a duplicate and goes with its row. Otherwise both stay,
   * a normal library skill: the library may hold the only whole copy now.
   */
  async function forgetUnadopted(skill: Skill, localPath: string): Promise<void> {
    await ctx.lock.run(`undo the upload of ${skill.name}`, async () => {
      const current = store.find(skill.id);
      if (!current) return;
      if (hashAsLibraryCopy(localPath, current.dirName) !== hashDir(current.libraryPath)) return;
      store.delete(current.id);
      await removePath(current.libraryPath);
    });
  }

  /** Delete on the user's word: a folder with content goes to Recently removed, the rest goes. */
  async function setAsideOrRemove(path: string, place: string): Promise<string[]> {
    const kept = await ctx.lock.run(`remove ${basename(path)}`, () =>
      deps.removed.setAside(path, { place, reason: "deleted" }),
    );
    if (kept) return [kept];
    await removePath(path);
    return [];
  }

  /** A broken folder as the UI shows it. Managed when one of our deployment rows sits there. */
  function toBrokenFolder(dir: BrokenDir): BrokenSkillFolder {
    return {
      dirName: basename(dir.path),
      relativePath: dir.relativePath,
      path: dir.path,
      reason: dir.reason,
      linkTarget: dir.linkTarget,
      files: dir.reason === "dangling_link" ? [] : listTopLevel(dir.path),
      managed: rowsAtPath(store.deployments(), dir.path).length > 0,
    };
  }

  function brokenFolders(agent: ResolvedAgent): BrokenSkillFolder[] {
    return walkSkillRoot(agent.skillsDir, agentScanOptions(agent)).broken.map(toBrokenFolder);
  }

  const api: WorkspaceApi = {
    list: async (agentKey) => {
      const agent = registry.get(agentKey);
      const index = library();
      const skills = scanSkillRoot(agent.skillsDir, agentScanOptions(agent)).map((entry) =>
        toLocalSkill(entry, index, "strict", {
          agentKey: agent.key,
          agentDisplayName: agent.displayName,
          enabled: true,
          isManaged: (skill) => store.deployment(skill.id, agent.key) !== null,
        }),
      );
      const plugins = listPluginSkills(agent);
      return sortByAttention(
        withPluginDuplicates(agent, withSharedFolderDuplicates(agent, skills), plugins),
      );
    },

    plugins: async (agentKey) => listPluginSkills(registry.get(agentKey)),

    counts: async (agentKeys) => {
      const counts: Record<string, number> = {};
      const byKey = new Map(registry.list().map((agent) => [agent.key, agent]));
      for (const key of agentKeys) {
        const agent = byKey.get(key);
        if (!agent) continue;
        // A folder we cannot read still has the skills we know we deployed there.
        counts[key] = isDirectory(agent.skillsDir)
          ? findLocalSkillDirs(agent.skillsDir, agentScanOptions(agent)).length
          : store.deploymentsForAgent(key).length;
      }
      return counts;
    },

    document: async (agentKey, relativePath) =>
      readLocalDocument(registry.get(agentKey).skillsDir, relativePath),

    upload: async (agentKey, relativePath) => {
      const { agent, entry, match } = locate(agentKey, relativePath);
      const known = new Set(store.list().map((skill) => skill.id));
      const skill = await pushLocalToLibrary(ctx, deps, entry, match);
      // A library folder that already held this content is reused, so "new" is judged by id.
      const created = !known.has(skill.id);
      try {
        await adoptLocal(skill, agent, entry.path);
      } catch (error) {
        ctx.log.warn(`Could not adopt ${entry.path}: ${errorMessage(error)}`);
        if (created) await forgetUnadopted(skill, entry.path);
        ctx.touched("skills");
        throw error;
      }
      ctx.touched("skills");
      return store.get(skill.id);
    },

    pull: async (agentKey, relativePath) => {
      const { agent, entry, match } = locate(agentKey, relativePath);
      if (!match) throw notFound("This skill is not in the library");
      if (classifySync(entry, match) === "local_newer") {
        throw invalid("Local skill is newer than the library version");
      }
      const kept = await replaceLocalFromLibrary(ctx, match, entry.path, {
        removed: deps.removed,
        place: agent.displayName,
      });
      // A deployment row is judged by its recorded hash, not by reading the folder, so the
      // content is replaced first; redeploying then only brings the row back in line.
      if (isDeployedHere(match, agent, entry.path)) await deploy.adopt(match, agent);
      ctx.activity.record("update", match.name, `${agent.displayName}: restored from the library`);
      ctx.touched("skills");
      return kept ? [kept] : [];
    },

    deleteLocal: async (agentKey, relativePath) => {
      const agent = registry.get(agentKey);
      const entry = requireLocalSkill(agent.skillsDir, relativePath);
      if (rowsAtPath(store.deployments(), entry.path).length > 0) {
        throw invalid(`Skill is managed by ${APP_NAME}. Remove it from the agent first.`);
      }
      const kept = await setAsideOrRemove(entry.path, agent.displayName);
      ctx.activity.record("remove", entry.name, `${agent.displayName}: local skill deleted`);
      ctx.touched("skills");
      return kept;
    },

    broken: async (agentKey) => brokenFolders(registry.get(agentKey)),

    deleteBroken: async (agentKey, relativePath) => {
      const agent = registry.get(agentKey);
      // Judged again now: the folder may have gained a SKILL.md since the list was shown.
      const wanted = toPosix(
        relative(agent.skillsDir, resolveInside(agent.skillsDir, relativePath)),
      );
      const folder = brokenFolders(agent).find((entry) => entry.relativePath === wanted);
      if (!folder) throw notFound(`No broken folder at ${relativePath}`);
      if (folder.managed) {
        throw invalid(`${APP_NAME} put this folder here. Deploy the skill again to repair it.`);
      }
      const kept = await setAsideOrRemove(folder.path, agent.displayName);
      ctx.activity.record("remove", folder.dirName, `${agent.displayName}: broken folder deleted`);
      ctx.touched("skills");
      return kept;
    },
  };

  return { api };
}
