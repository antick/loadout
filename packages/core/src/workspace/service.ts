import { join } from "node:path";
import {
  APP_NAME,
  type LocalSkill,
  type Skill,
  type SyncStatus,
  type WorkspaceApi,
} from "@loadout/shared";
import type { AgentRegistry, ResolvedAgent } from "../agents/registry";
import type { CoreContext } from "../context";
import type { DeployService } from "../deploy";
import { rowsAtPath, samePath } from "../deploy/evidence";
import { errorMessage, exists, invalid, notFound } from "../errors";
import type { SkillStore } from "../skills/store";
import { isDirectory, lstatOrNull, removePath } from "../util/fs";
import { hashDir } from "../util/hash";
import {
  type LocalSyncDeps,
  pushLocalToLibrary,
  readLocalDocument,
  replaceLocalFromLibrary,
  repointSources,
  requireLocalSkill,
  toLocalSkill,
} from "./local-actions";
import {
  type LibraryIndex,
  type LocalEntry,
  type ScanOptions,
  classifySync,
  findLocalSkillDirs,
  indexLibrary,
  matchLibrarySkill,
  scanSkillRoot,
} from "./local-scan";

export interface WorkspaceServiceDeps {
  store: SkillStore;
  registry: AgentRegistry;
  deploy: Pick<DeployService, "adopt" | "refreshCopies">;
  install: LocalSyncDeps["install"];
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

const scanOptions = (agent: ResolvedAgent): ScanOptions => ({ recursive: agent.recursiveScan });

export function sortByAttention(skills: LocalSkill[]): LocalSkill[] {
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
      if (hashDir(localPath) === current.contentHash) await removePath(localPath);
      else ctx.log.warn(`Kept ${localPath}: it changed while it was being adopted`);
    });
  }

  const api: WorkspaceApi = {
    list: async (agentKey) => {
      const agent = registry.get(agentKey);
      const index = library();
      const skills = scanSkillRoot(agent.skillsDir, scanOptions(agent)).map((entry) =>
        toLocalSkill(entry, index, "strict", {
          agentKey: agent.key,
          agentDisplayName: agent.displayName,
          enabled: true,
          isManaged: (skill) => store.deployment(skill.id, agent.key) !== null,
        }),
      );
      return sortByAttention(skills);
    },

    counts: async (agentKeys) => {
      const counts: Record<string, number> = {};
      for (const key of agentKeys) {
        const agent = registry.find(key);
        if (!agent) continue;
        // A folder we cannot read still has the skills we know we deployed there.
        counts[key] = isDirectory(agent.skillsDir)
          ? findLocalSkillDirs(agent.skillsDir, scanOptions(agent)).length
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
        // The library folder stays: it is the only other copy of what the user just uploaded.
        if (created) store.delete(skill.id);
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
      await replaceLocalFromLibrary(ctx, match, entry.path);
      // A deployment row is judged by its recorded hash, not by reading the folder, so the
      // content is replaced first; redeploying then only brings the row back in line.
      if (isDeployedHere(match, agent, entry.path)) await deploy.adopt(match, agent);
      ctx.activity.record("update", match.name, `${agent.displayName}: restored from the library`);
      ctx.touched("skills");
    },

    deleteLocal: async (agentKey, relativePath) => {
      const agent = registry.get(agentKey);
      const entry = requireLocalSkill(agent.skillsDir, relativePath);
      if (rowsAtPath(store.deployments(), entry.path).length > 0) {
        throw invalid(`Skill is managed by ${APP_NAME} — remove it from the agent first.`);
      }
      await removePath(entry.path);
      ctx.activity.record("remove", entry.name, `${agent.displayName}: local skill deleted`);
      ctx.touched("skills");
    },
  };

  return { api };
}
