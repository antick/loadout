/**
 * DEV ONLY. `editor.*` (library skills only) and the version history for the browser
 * preview: every skill gets a few in-memory files, and saves keep earlier versions.
 */
import type {
  EditTarget,
  ErrorCode,
  SaveSkillFileInput,
  SaveSkillFileResult,
  Skill,
  SkillFile,
  SkillFileChangeResult,
  SkillFileEntry,
  SkillFileVersion,
  SkillLocation,
} from "@loadout/shared";
import type { MockHandlers } from "@/lib/dev-mock-types";

export interface EditorMockContext {
  getSkills(): Skill[];
  setSkills(next: Skill[]): void;
  emitChanged(...scope: "skills"[]): void;
  fail(code: ErrorCode, message: string): never;
  /** The skill's main document as the rest of the preview shows it. */
  document(skill: Skill): string;
}

/** Copies deployed to this agent are reported as edited in place, to show the warning. */
const EDITED_COPY_AGENT = "codex";
const VERSIONS_KEPT = 20;
const MAIN_DOCUMENT = "SKILL.md";

const EXTRA_FILES: Record<string, string> = {
  "scripts/check.sh": '#!/bin/sh\nset -eu\necho "checking"\n',
  "references/checklist.md": "# Checklist\n\n- [ ] Read the request\n- [ ] Check the result\n",
  "config.yaml": "retries: 2\nverbose: false\n",
};
const LOCKED_FILES: SkillFileEntry[] = [
  { path: "assets/diagram.png", size: 48_213, locked: "binary", main: false, edited: false },
];

/** One skill's folder in memory. */
interface MockFolder {
  text: Map<string, string>;
  locked: Map<string, SkillFileEntry>;
  /** Folders made on their own, which stay while empty. */
  folders: Set<string>;
}

/** Stand-in for a content hash: the preview only needs equal text to mean equal hashes. */
function hashOf(content: string): string {
  let hash = 0;
  for (let index = 0; index < content.length; index += 1) {
    hash = (hash * 31 + content.charCodeAt(index)) | 0;
  }
  return `mock-${(hash >>> 0).toString(16)}-${content.length}`;
}

const within = (path: string, folder: string): boolean =>
  path === folder || path.startsWith(`${folder}/`);
const clean = (path: string): string =>
  path
    .split(/[\\/]+/)
    .filter(Boolean)
    .join("/");

/** Every file and folder path of the skill. */
function pathsOf(folder: MockFolder): string[] {
  const files = [...folder.text.keys(), ...folder.locked.keys()];
  const parents = files.flatMap((path) =>
    path
      .split("/")
      .slice(0, -1)
      .map((_, index, parts) => parts.slice(0, index + 1).join("/")),
  );
  return [...new Set([...files, ...parents, ...folder.folders])];
}

export function createEditorMockHandlers(ctx: EditorMockContext): MockHandlers {
  const skillFolders = new Map<string, MockFolder>();
  const versions = new Map<string, { id: string; savedAt: number; content: string }[]>();

  /** The preview only has library skills; other places answer with a clear error. */
  function idOf(location: SkillLocation): string {
    if (location.kind === "library") return location.skillId;
    return ctx.fail("UNSUPPORTED", "The preview can only edit library skills.");
  }

  function skillOf(skillId: string): Skill {
    const skill = ctx.getSkills().find((entry) => entry.id === skillId);
    return skill ?? ctx.fail("NOT_FOUND", `Skill not found: ${skillId}`);
  }

  function folderOf(skill: Skill): MockFolder {
    let folder = skillFolders.get(skill.id);
    if (!folder) {
      folder = {
        text: new Map([[MAIN_DOCUMENT, ctx.document(skill)], ...Object.entries(EXTRA_FILES)]),
        locked: new Map(LOCKED_FILES.map((entry) => [entry.path, entry])),
        folders: new Set(),
      };
      skillFolders.set(skill.id, folder);
    }
    return folder;
  }

  function read(skill: Skill, path: string): SkillFile {
    const content = folderOf(skill).text.get(path);
    if (content === undefined) ctx.fail("NOT_FOUND", `${path} no longer exists in ${skill.name}`);
    return { path, content, hash: hashOf(content), eol: "lf", modifiedAt: Date.now() };
  }

  function keepVersion(skillId: string, path: string, content: string): void {
    const key = `${skillId}:${path}`;
    const kept = versions.get(key) ?? [];
    kept.unshift({ id: String(Date.now()), savedAt: Date.now(), content });
    versions.set(key, kept.slice(0, VERSIONS_KEPT));
  }

  function refuseTaken(folder: MockFolder, path: string): void {
    if (!path) ctx.fail("INVALID_INPUT", "A path is required");
    if (path.split("/").includes(".git")) ctx.fail("UNSUPPORTED", `${path} cannot be changed here`);
    const lower = path.toLowerCase();
    if (pathsOf(folder).some((taken) => taken.toLowerCase() === lower)) {
      ctx.fail("ALREADY_EXISTS", `${path} already exists`);
    }
  }

  /** Record a change like core does: edit marks, a refreshed skill, copies. */
  function changed(skill: Skill, path: string, files: string[]): SkillFileChangeResult {
    const editedFiles = [...new Set([...skill.editedFiles, ...files])].sort();
    const updated: Skill = { ...skill, editedFiles, updatedAt: Date.now() };
    ctx.setSkills(ctx.getSkills().map((entry) => (entry.id === skill.id ? updated : entry)));
    ctx.emitChanged("skills");
    const agents = skill.deployments.map((entry) => entry.agentKey);
    return {
      skill: updated,
      path,
      copiesRefreshed: agents.filter((agent) => agent !== EDITED_COPY_AGENT).length,
      copiesKept: agents.filter((agent) => agent === EDITED_COPY_AGENT),
    };
  }

  function refuseMain(path: string): void {
    if (within(MAIN_DOCUMENT, path)) {
      ctx.fail("INVALID_INPUT", `${path} holds the skill's main document`);
    }
  }

  return {
    "editor.target": (location: SkillLocation): EditTarget => {
      const skill = skillOf(idOf(location));
      return {
        location,
        name: skill.name,
        folderName: skill.dirName,
        path: skill.libraryPath,
        placeLabel: "Library",
        librarySkillId: skill.id,
        otherCopies: [],
      };
    },

    "editor.files": (location: SkillLocation): SkillFileEntry[] => {
      const skill = skillOf(idOf(location));
      const folder = folderOf(skill);
      const edited = new Set(skill.editedFiles);
      const text = [...folder.text].map(([path, content]) => ({
        path,
        size: content.length,
        locked: null,
        main: path === MAIN_DOCUMENT,
        edited: edited.has(path),
      }));
      return [...text, ...folder.locked.values()].sort(
        (a, b) => Number(b.main) - Number(a.main) || a.path.localeCompare(b.path),
      );
    },

    "editor.folders": (location: SkillLocation): string[] => {
      const folder = folderOf(skillOf(idOf(location)));
      const files = new Set([...folder.text.keys(), ...folder.locked.keys()]);
      return pathsOf(folder)
        .filter((path) => !files.has(path))
        .sort();
    },

    "editor.readFile": (location: SkillLocation, path: string) =>
      read(skillOf(idOf(location)), path),

    "editor.saveFile": (
      location: SkillLocation,
      input: SaveSkillFileInput,
    ): SaveSkillFileResult => {
      const skillId = idOf(location);
      const skill = skillOf(skillId);
      const current = read(skill, input.path);
      if (current.hash !== input.baseHash && !input.overwrite) {
        ctx.fail("CHANGED_ON_DISK", `${input.path} changed on disk after you opened it.`);
      }
      if (current.content === input.content) {
        return {
          skill,
          file: current,
          written: false,
          copiesRefreshed: 0,
          copiesKept: [],
          otherCopiesSaved: [],
          otherCopiesSkipped: [],
        };
      }
      keepVersion(skillId, input.path, current.content);
      folderOf(skill).text.set(input.path, input.content);
      const { skill: updated, ...copies } = changed(skill, input.path, [input.path]);
      return {
        skill: updated,
        file: read(updated, input.path),
        written: true,
        copiesRefreshed: copies.copiesRefreshed,
        copiesKept: copies.copiesKept,
        otherCopiesSaved: [],
        otherCopiesSkipped: [],
      };
    },

    "editor.createFile": (location: SkillLocation, path: string): SkillFileChangeResult => {
      const skill = skillOf(idOf(location));
      const folder = folderOf(skill);
      const target = clean(path);
      refuseTaken(folder, target);
      folder.text.set(target, "");
      return changed(skill, target, [target]);
    },

    "editor.createFolder": (location: SkillLocation, path: string): SkillFileChangeResult => {
      const skill = skillOf(idOf(location));
      const folder = folderOf(skill);
      const target = clean(path);
      refuseTaken(folder, target);
      folder.folders.add(target);
      return changed(skill, target, []);
    },

    "editor.renameFile": (
      location: SkillLocation,
      from: string,
      to: string,
    ): SkillFileChangeResult => {
      const skill = skillOf(idOf(location));
      const folder = folderOf(skill);
      const source = clean(from);
      const target = clean(to);
      refuseMain(source);
      if (!pathsOf(folder).includes(source)) ctx.fail("NOT_FOUND", `${source} no longer exists`);
      if (source.toLowerCase() !== target.toLowerCase()) refuseTaken(folder, target);
      if (within(target, source) && target !== source) {
        ctx.fail("INVALID_INPUT", `${source} cannot be moved into itself`);
      }
      const move = (path: string): string => `${target}${path.slice(source.length)}`;
      const inside = <T>(entries: Iterable<[string, T]>): [string, T][] =>
        Array.from(entries).filter(([path]) => within(path, source));
      const text = inside(folder.text);
      const locked = inside(folder.locked);
      const kept = inside(folder.folders.entries());
      for (const [path] of [...text, ...locked]) {
        folder.text.delete(path);
        folder.locked.delete(path);
      }
      for (const [path] of kept) folder.folders.delete(path);
      for (const [path, content] of text) folder.text.set(move(path), content);
      for (const [path, entry] of locked) {
        folder.locked.set(move(path), { ...entry, path: move(path) });
      }
      for (const [path] of kept) folder.folders.add(move(path));
      return changed(
        skill,
        target,
        [...text, ...locked].map(([path]) => move(path)),
      );
    },

    "editor.deleteFile": (location: SkillLocation, path: string): SkillFileChangeResult => {
      const skillId = idOf(location);
      const skill = skillOf(skillId);
      const folder = folderOf(skill);
      const target = clean(path);
      refuseMain(target);
      if (!pathsOf(folder).includes(target)) ctx.fail("NOT_FOUND", `${target} no longer exists`);
      const inside = (paths: Iterable<string>): string[] =>
        Array.from(paths).filter((file) => within(file, target));
      const deleted = inside([...folder.text.keys(), ...folder.locked.keys()]);
      for (const file of deleted) {
        const content = folder.text.get(file);
        if (content !== undefined) keepVersion(skillId, file, content);
        folder.text.delete(file);
        folder.locked.delete(file);
      }
      for (const kept of inside(folder.folders)) folder.folders.delete(kept);
      return changed(skill, target, deleted);
    },

    "editor.fileVersions": (location: SkillLocation, path: string): SkillFileVersion[] =>
      (versions.get(`${idOf(location)}:${path}`) ?? []).map(({ id, savedAt, content }) => ({
        id,
        savedAt,
        size: content.length,
      })),

    "editor.readFileVersion": (location: SkillLocation, path: string, versionId: string) => {
      const version = versions
        .get(`${idOf(location)}:${path}`)
        ?.find((entry) => entry.id === versionId);
      return version?.content ?? ctx.fail("NOT_FOUND", "That earlier version is no longer kept");
    },
  };
}
