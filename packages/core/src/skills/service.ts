import type { BatchResult, Skill, SkillDocument, SkillsApi } from "@loadout/shared";
import type { CoreContext } from "../context";
import { errorMessage, invalid } from "../errors";
import { listTopLevel, removePath } from "../util/fs";
import type { FileHistory } from "../editor/history";
import type { InstallIntoLibrary } from "../install/library";
import { createSkill } from "./create";
import { type RenameDeps, renameSkill } from "./rename";
import { exportTarget, writeSkillsArchive } from "./export";
import { readSkillDocument } from "./metadata";
import type { SkillStore } from "./store";

export interface SkillsServiceDeps {
  store: SkillStore;
  /** Remove every deployed copy of a skill (ownership-checked) before the skill itself goes. */
  removeDeployments: (skill: Skill) => Promise<void>;
  /** Earlier versions kept by the editor; a removed skill's go with it. */
  history: FileHistory;
  /** The one way into the library; a new skill goes in through it too. */
  install: InstallIntoLibrary;
  /** A rename moves the skill's deployments and project links along with it. */
  rename: Omit<RenameDeps, "store">;
}

export interface SkillsService {
  api: SkillsApi;
  store: SkillStore;
}

export function createSkillsService(ctx: CoreContext, deps: SkillsServiceDeps): SkillsService {
  const { store } = deps;
  const { history } = deps;

  async function removeOne(skillId: string): Promise<void> {
    const skill = store.get(skillId);
    await ctx.lock.run(`remove ${skill.name}`, async () => {
      await deps.removeDeployments(skill);
      await removePath(skill.libraryPath);
      store.delete(skill.id);
    });
    try {
      history.removeSkill(skill.id);
    } catch (error) {
      ctx.log.warn(`Could not forget the edit history of ${skill.name}`, error);
    }
    ctx.activity.record("remove", skill.name);
  }

  const api: SkillsApi = {
    list: async () => store.list(),

    get: async (skillId) => store.get(skillId),

    create: async (input) => createSkill(ctx, store, deps.install, input),

    document: async (skillId): Promise<SkillDocument> => {
      const skill = store.get(skillId);
      const found = readSkillDocument(skill.libraryPath);
      return {
        filename: found?.filename ?? "",
        content: found?.content ?? "",
        files: listTopLevel(skill.libraryPath),
        path: skill.libraryPath,
      };
    },

    remove: async (skillId) => {
      await removeOne(skillId);
      ctx.touched("skills", "presets");
    },

    removeMany: async (skillIds): Promise<BatchResult> => {
      const result: BatchResult = { succeeded: 0, failed: [] };
      for (const skillId of skillIds) {
        const name = store.find(skillId)?.name ?? skillId;
        try {
          await removeOne(skillId);
          result.succeeded += 1;
        } catch (error) {
          result.failed.push({ name, message: errorMessage(error) });
        }
      }
      ctx.touched("skills", "presets");
      return result;
    },

    allTags: async () => store.allTags(),

    setTags: async (skillId, tags) => {
      store.get(skillId);
      store.setTags(skillId, tags);
      ctx.touched("skills");
    },

    rename: (skillId, name, options) =>
      renameSkill(ctx, { store, ...deps.rename }, skillId, name, options),

    renameTag: async (from, to) => {
      const source = from.trim();
      const target = to.trim();
      if (!source || !target) throw invalid("Tag name cannot be empty");
      if (source === target) return;
      store.renameTag(source, target);
      ctx.touched("skills");
    },

    deleteTag: async (tag) => {
      store.deleteTag(tag.trim());
      ctx.touched("skills");
    },

    reveal: async (skillId) => ctx.host.revealPath(store.get(skillId).libraryPath),

    exportArchive: async (skillIds, destPath) => {
      const path = exportTarget(destPath, ctx.paths.skillsDir);
      const skills = [...new Set(skillIds)].map((id) => store.get(id));
      const result = writeSkillsArchive(skills, path);
      const [only] = skills;
      const subject = only && skills.length === 1 ? only.name : `${skills.length} skills`;
      ctx.activity.record("export", subject, path);
      return result;
    },
  };

  return { api, store };
}
