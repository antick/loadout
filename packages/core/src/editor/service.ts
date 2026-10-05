import type {
  DataScope,
  EditorApi,
  SaveSkillFileResult,
  Skill,
  SkillFileChangeResult,
  SkillLocation,
} from "@loadout/shared";
import type { AgentRegistry } from "../agents/registry";
import type { CoreContext } from "../context";
import { unsupported } from "../errors";
import type { InstructionFinder } from "../instructions/finder";
import type { ProjectStore } from "../projects/store";
import { readSkillIdentity } from "../skills/metadata";
import type { SkillStore } from "../skills/store";
import { segmentsOf } from "../util/fs";
import { hashDir } from "../util/hash";
import {
  type EditableFolder,
  applyToCopy,
  listFolderFiles,
  readFileAt,
  writeFileAt,
} from "./files";
import type { FileHistory } from "./history";
import { type ResolvedLocation, createLocationResolver } from "./locations";
import {
  type FolderChange,
  createFileIn,
  createFolderIn,
  deleteIn,
  listFolders,
  renameIn,
} from "./manage";

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
  instructions: InstructionFinder;
  history: FileHistory;
  /** After a library edit: rewrite copy deployments, leaving copies edited in place. */
  refreshCopies(skill: Skill): Promise<CopyRefresh>;
}

const LIBRARY_ONLY = "Files can be added, renamed or deleted only in library skills";
const INSTRUCTIONS_LOCK_LABEL = "an instruction file";
const UNKNOWN_LOCK_LABEL = "a file";
/** How the activity history words a file change. */
const CHANGE_DETAIL = {
  create: (change: FolderChange) => `Created ${change.path}`,
  rename: (change: FolderChange, from: string) => `Renamed ${from} to ${change.path}`,
  delete: (change: FolderChange) => `Deleted ${change.path}`,
};

/** What an edit outside the library changes: an agent's folder or a project. */
function scopeOf(location: SkillLocation): DataScope {
  if (location.kind === "agent") return "agents";
  if (location.kind === "instructions" && location.projectId === null) return "agents";
  return "projects";
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
  const { resolve, describeTarget } = createLocationResolver(ctx, deps);

  /**
   * What the lock held for an edit is called (another process's BUSY message names it), from the
   * location alone: the folder itself is resolved once, under the lock.
   */
  function lockLabel(location: SkillLocation): string {
    switch (location?.kind) {
      case "library":
        return store.find(location.skillId)?.name ?? location.skillId;
      case "agent":
      case "project":
        return location.relativePath;
      case "instructions":
        return INSTRUCTIONS_LOCK_LABEL;
      default:
        return UNKNOWN_LOCK_LABEL;
    }
  }

  /** Library bookkeeping after a change: name, description, hash, edit marks, copies. */
  async function afterLibraryChange(
    skill: Skill,
    paths: readonly string[],
  ): Promise<{
    skill: Skill;
    copies: CopyRefresh;
  }> {
    const identity = readSkillIdentity(skill.libraryPath);
    const updated = store.update(skill.id, {
      name: identity.name,
      description: identity.description,
      contentHash: hashDir(skill.libraryPath),
      editedFiles: [...skill.editedFiles, ...paths],
    });
    const copies = await deps.refreshCopies(updated);
    return { skill: store.get(skill.id), copies };
  }

  /**
   * Create, rename or delete in a library skill under the lock, then record it like a save:
   * edit marks, hash, copies, activity.
   */
  async function changeFiles(
    location: SkillLocation,
    apply: (folder: EditableFolder) => FolderChange,
    detail: (change: FolderChange) => string,
  ): Promise<SkillFileChangeResult> {
    const result = await ctx.lock.run(`edit ${lockLabel(location)}`, async () => {
      const resolved = resolve(location);
      if (!resolved.librarySkill) throw unsupported(LIBRARY_ONLY);
      const change = apply(resolved.folder);
      const { skill, copies } = await afterLibraryChange(resolved.librarySkill, change.files);
      ctx.activity.record("edit", skill.name, detail(change));
      return { skill, path: change.path, copiesRefreshed: copies.written, copiesKept: copies.kept };
    });
    ctx.touched("skills");
    return result;
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
    target: async (location) => describeTarget(resolve(location)),

    files: async (location) => {
      const resolved = resolve(location);
      return listFolderFiles(resolved.folder, new Set(resolved.librarySkill?.editedFiles ?? []));
    },

    readFile: async (location, path) => readFileAt(resolve(location).folder, path),

    saveFile: async (location, input) => {
      const label = `edit ${lockLabel(location)}`;
      const result = await ctx.lock.run(label, async (): Promise<SaveSkillFileResult> => {
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
          const { skill, copies } = await afterLibraryChange(resolved.librarySkill, [
            outcome.file.path,
          ]);
          ctx.activity.record("edit", skill.name, outcome.file.path);
          return { ...base, skill, copiesRefreshed: copies.written, copiesKept: copies.kept };
        }
        const { placeLabel, name } = resolved.target;
        ctx.activity.record("edit", name, `${placeLabel}: ${outcome.file.path}`);
        if (input.otherCopies === "identical") {
          const copies = carryToCopies(resolved, outcome.file.path, outcome.before, outcome.after);
          return { ...base, otherCopiesSaved: copies.saved, otherCopiesSkipped: copies.skipped };
        }
        return base;
      });
      if (result.written) {
        // A copy that turned out to be a library link was saved as the library skill.
        ctx.touched(result.skill ? "skills" : scopeOf(location));
      }
      return result;
    },

    fileVersions: async (location, path) =>
      history.list(resolve(location).folder.historyKey, segmentsOf(path).join("/")),

    readFileVersion: async (location, path, versionId) =>
      history.read(resolve(location).folder.historyKey, segmentsOf(path).join("/"), versionId),

    folders: async (location) => {
      const { folder } = resolve(location);
      return folder.only === undefined ? listFolders(folder.dir) : [];
    },

    createFile: (location, path) =>
      changeFiles(location, (folder) => createFileIn(folder, path), CHANGE_DETAIL.create),

    createFolder: (location, path) =>
      changeFiles(location, (folder) => createFolderIn(folder, path), CHANGE_DETAIL.create),

    renameFile: (location, from, to) =>
      changeFiles(
        location,
        (folder) => renameIn(folder, from, to),
        (change) => CHANGE_DETAIL.rename(change, segmentsOf(from).join("/")),
      ),

    deleteFile: (location, path) =>
      changeFiles(location, (folder) => deleteIn(folder, path, history), CHANGE_DETAIL.delete),
  };

  return { api };
}
