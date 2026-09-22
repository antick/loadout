import type { EditorApi, SaveSkillFileResult, Skill } from "@loadout/shared";
import type { AgentRegistry } from "../agents/registry";
import type { CoreContext } from "../context";
import type { ProjectStore } from "../projects/store";
import { readSkillIdentity } from "../skills/metadata";
import type { SkillStore } from "../skills/store";
import { hashDir } from "../util/hash";
import { applyToCopy, listFiles, readFileAt, segmentsOf, writeFileAt } from "./files";
import type { FileHistory } from "./history";
import { type ResolvedLocation, createLocationResolver } from "./locations";

/** Outcome of rewriting a library skill's copy deployments after an edit. */
export interface CopyRefresh {
  written: number;
  /** Agent keys whose copy was left alone because it was edited in place. */
  kept: string[];
}

export interface EditorServiceDeps {
  store: SkillStore;
  registry: AgentRegistry;
  projects: ProjectStore;
  history: FileHistory;
  /** After a library edit: rewrite copy deployments, leaving copies edited in place. */
  refreshCopies(skill: Skill): Promise<CopyRefresh>;
}

export interface EditorService {
  api: EditorApi;
}

/**
 * The editor behind `api.editor`: a library skill, a skill in an agent's folder, or a copy in a
 * project, all edited the same way. Library saves also update the skill's row and deployed
 * copies; project saves can carry the change to the project's other identical copies.
 */
export function createEditorService(ctx: CoreContext, deps: EditorServiceDeps): EditorService {
  const { store, history } = deps;
  const resolve = createLocationResolver(ctx, deps);

  /** Library bookkeeping after a written save: name, description, hash, edit marks, copies. */
  async function afterLibrarySave(
    skill: Skill,
    path: string,
  ): Promise<{
    skill: Skill;
    copies: CopyRefresh;
  }> {
    const identity = readSkillIdentity(skill.libraryPath);
    const updated = store.update(skill.id, {
      name: identity.name,
      description: identity.description,
      contentHash: hashDir(skill.libraryPath),
      editedFiles: [...skill.editedFiles, path],
    });
    const copies = await deps.refreshCopies(updated);
    return { skill: store.get(skill.id), copies };
  }

  function carryToCopies(resolved: ResolvedLocation, path: string, before: Buffer, after: Buffer) {
    const saved: string[] = [];
    const skipped: string[] = [];
    for (const copy of resolved.otherCopies) {
      if (applyToCopy(copy.folder, path, before, after, history)) saved.push(copy.agentKey);
      else skipped.push(copy.agentKey);
    }
    return { saved, skipped };
  }

  const api: EditorApi = {
    target: async (location) => resolve(location).target,

    files: async (location) => {
      const resolved = resolve(location);
      return listFiles(resolved.folder.dir, new Set(resolved.librarySkill?.editedFiles ?? []));
    },

    readFile: async (location, path) => readFileAt(resolve(location).folder, path),

    saveFile: async (location, input) => {
      const { label } = resolve(location).folder;
      const result = await ctx.lock.run(`edit ${label}`, async (): Promise<SaveSkillFileResult> => {
        const resolved = resolve(location);
        const outcome = writeFileAt(resolved.folder, input, history);
        const base: SaveSkillFileResult = {
          skill: resolved.librarySkill,
          file: outcome.file,
          written: outcome.written,
          copiesRefreshed: 0,
          copiesKept: [],
          otherCopiesSaved: [],
          otherCopiesSkipped: [],
        };
        if (!outcome.written) return base;
        if (resolved.librarySkill) {
          const { skill, copies } = await afterLibrarySave(
            resolved.librarySkill,
            outcome.file.path,
          );
          ctx.activity.record("edit", skill.name, outcome.file.path);
          return { ...base, skill, copiesRefreshed: copies.written, copiesKept: copies.kept };
        }
        const where = `${resolved.target.placeLabel}: ${outcome.file.path}`;
        ctx.activity.record("edit", resolved.target.name, where);
        if (input.otherCopies === "identical") {
          const copies = carryToCopies(resolved, outcome.file.path, outcome.before, outcome.after);
          return { ...base, otherCopiesSaved: copies.saved, otherCopiesSkipped: copies.skipped };
        }
        return base;
      });
      if (result.written) {
        // A copy that turned out to be a library link was saved as the library skill.
        ctx.touched(result.skill ? "skills" : location.kind === "agent" ? "agents" : "projects");
      }
      return result;
    },

    fileVersions: async (location, path) =>
      history.list(resolve(location).folder.historyKey, segmentsOf(path).join("/")),

    readFileVersion: async (location, path, versionId) =>
      history.read(resolve(location).folder.historyKey, segmentsOf(path).join("/"), versionId),
  };

  return { api };
}
