import {
  type RemoveSkillsResult,
  type Skill,
  type SkillDocument,
  type SkillsApi,
  canLinkSource,
  cleanSkillNote,
  cleanSuggestPatterns,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { errorMessage, invalid } from "../errors";
import { listTopLevel, removePath } from "../util/fs";
import type { FileHistory } from "../editor/history";
import type { InstallIntoLibrary } from "../install/library";
import type { RemovedStore } from "../storage/removed";
import { LIBRARY_PLACE, libraryRecordOf } from "../storage/removed-library";
import { createSkill } from "./create";
import { type RenameDeps, renameSkill } from "./rename";
import { exportTarget, writeSkillsArchive } from "./export";
import { readSkillDocument } from "./metadata";
import type { SkillStore } from "./store";

const HAS_SOURCE = "This skill already follows a source, so it cannot be marked as your own.";

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
  /** A deleted skill is kept here for a while, so it can be put back. */
  removed: RemovedStore;
}

export interface SkillsService {
  api: SkillsApi;
  store: SkillStore;
}

export function createSkillsService(ctx: CoreContext, deps: SkillsServiceDeps): SkillsService {
  const { store } = deps;
  const { history } = deps;

  /** Delete a skill; returns its Recently removed entry, or null when nothing was kept. */
  async function removeOne(skillId: string): Promise<string | null> {
    const skill = store.get(skillId);
    const removedId = await ctx.lock.run(`remove ${skill.name}`, async () => {
      await deps.removeDeployments(skill);
      const kept = deps.removed.setAside(skill.libraryPath, {
        place: LIBRARY_PLACE,
        reason: "deleted",
        library: libraryRecordOf(skill),
      });
      if (kept === null) await removePath(skill.libraryPath);
      try {
        store.delete(skill.id);
      } catch (error) {
        if (kept !== null) deps.removed.putBack(kept);
        throw error;
      }
      return kept;
    });
    try {
      history.removeSkill(skill.id);
    } catch (error) {
      ctx.log.warn(`Could not forget the edit history of ${skill.name}`, error);
    }
    ctx.activity.record("remove", skill.name);
    return removedId;
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

    removeMany: async (skillIds, options): Promise<RemoveSkillsResult> => {
      const result: RemoveSkillsResult = { succeeded: 0, failed: [], removedIds: [] };
      for (const skillId of skillIds) {
        const name = store.find(skillId)?.name ?? skillId;
        try {
          if (options?.dryRun) {
            // What `removeOne` refuses before it changes anything: a skill that is not there.
            store.get(skillId);
            result.succeeded += 1;
            continue;
          }
          const removedId = await removeOne(skillId);
          if (removedId !== null) result.removedIds.push(removedId);
          result.succeeded += 1;
        } catch (error) {
          result.failed.push({ name, message: errorMessage(error) });
        }
      }
      if (!options?.dryRun) ctx.touched("skills", "presets");
      return result;
    },

    allTags: async () => store.allTags(),

    setTags: async (skillId, tags) => {
      await ctx.lock.run(`tag ${store.get(skillId).name}`, () => {
        store.get(skillId);
        store.setTags(skillId, tags);
      });
      ctx.touched("skills");
    },

    rename: (skillId, name, options) =>
      renameSkill(ctx, { store, ...deps.rename }, skillId, name, options),

    renameTag: async (from, to) => {
      const source = from.trim();
      const target = to.trim();
      if (!source || !target) throw invalid("Tag name cannot be empty");
      if (source === target) return;
      await ctx.lock.run(`rename the tag ${source}`, () => store.renameTag(source, target));
      ctx.touched("skills");
    },

    deleteTag: async (tag) => {
      const clean = tag.trim();
      await ctx.lock.run(`delete the tag ${clean}`, () => store.deleteTag(clean));
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

    setSuggestFor: async (skillId, patterns) => {
      const clean = cleanSuggestPatterns(patterns);
      const skill = await ctx.lock.run(`suggest ${store.get(skillId).name}`, () =>
        store.update(skillId, { suggestFor: clean }),
      );
      ctx.touched("skills");
      return skill;
    },

    setNote: async (skillId, note) => {
      const clean = cleanSkillNote(note);
      const skill = await ctx.lock.run(`note ${store.get(skillId).name}`, () =>
        store.update(skillId, { note: clean }),
      );
      ctx.touched("skills");
      return skill;
    },

    setFavorite: async (skillId, favorite) => {
      const skill = await ctx.lock.run(`favourite ${store.get(skillId).name}`, () => {
        const fresh = store.get(skillId);
        // Already as asked: the time it became one stays.
        if (favorite === (fresh.favoritedAt !== null)) return fresh;
        return store.update(skillId, { favoritedAt: favorite ? Date.now() : null });
      });
      ctx.touched("skills");
      return skill;
    },

    setAuthored: async (skillId, authored) => {
      const skill = await ctx.lock.run(`mark ${store.get(skillId).name}`, () => {
        const fresh = store.get(skillId);
        if (authored && !canLinkSource(fresh)) throw invalid(HAS_SOURCE);
        return store.update(skillId, { authored });
      });
      ctx.touched("skills");
      return skill;
    },
  };

  return { api, store };
}
