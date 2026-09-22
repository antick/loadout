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
  SkillFileEntry,
  SkillFileVersion,
  SkillLocation,
} from "@loadout/shared";

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

const EXTRA_FILES: Record<string, string> = {
  "scripts/check.sh": '#!/bin/sh\nset -eu\necho "checking"\n',
  "references/checklist.md": "# Checklist\n\n- [ ] Read the request\n- [ ] Check the result\n",
  "config.yaml": "retries: 2\nverbose: false\n",
};
const LOCKED_FILES: SkillFileEntry[] = [
  { path: "assets/diagram.png", size: 48_213, locked: "binary", main: false, edited: false },
];

/** Stand-in for a content hash: the preview only needs equal text to mean equal hashes. */
function hashOf(content: string): string {
  let hash = 0;
  for (let index = 0; index < content.length; index += 1) {
    hash = (hash * 31 + content.charCodeAt(index)) | 0;
  }
  return `mock-${(hash >>> 0).toString(16)}-${content.length}`;
}

export function createEditorMockHandlers(
  ctx: EditorMockContext,
): Record<string, (...args: never[]) => unknown> {
  const files = new Map<string, Map<string, string>>();
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

  function filesOf(skill: Skill): Map<string, string> {
    let entries = files.get(skill.id);
    if (!entries) {
      entries = new Map([["SKILL.md", ctx.document(skill)], ...Object.entries(EXTRA_FILES)]);
      files.set(skill.id, entries);
    }
    return entries;
  }

  function read(skill: Skill, path: string): SkillFile {
    const content = filesOf(skill).get(path);
    if (content === undefined) ctx.fail("NOT_FOUND", `${path} no longer exists in ${skill.name}`);
    return { path, content, hash: hashOf(content), eol: "lf", modifiedAt: Date.now() };
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
      const edited = new Set(skill.editedFiles);
      const text = [...filesOf(skill)].map(([path, content]) => ({
        path,
        size: content.length,
        locked: null,
        main: path === "SKILL.md",
        edited: edited.has(path),
      }));
      return [...text, ...LOCKED_FILES].sort(
        (a, b) => Number(b.main) - Number(a.main) || a.path.localeCompare(b.path),
      );
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
      const key = `${skillId}:${input.path}`;
      const kept = versions.get(key) ?? [];
      kept.unshift({ id: String(Date.now()), savedAt: Date.now(), content: current.content });
      versions.set(key, kept.slice(0, VERSIONS_KEPT));
      filesOf(skill).set(input.path, input.content);

      const editedFiles = [...new Set([...skill.editedFiles, input.path])].sort();
      const updated: Skill = { ...skill, editedFiles, updatedAt: Date.now() };
      ctx.setSkills(ctx.getSkills().map((entry) => (entry.id === skillId ? updated : entry)));
      ctx.emitChanged("skills");
      const agents = skill.deployments.map((entry) => entry.agentKey);
      return {
        skill: updated,
        file: read(updated, input.path),
        written: true,
        copiesRefreshed: agents.filter((agent) => agent !== EDITED_COPY_AGENT).length,
        copiesKept: agents.filter((agent) => agent === EDITED_COPY_AGENT),
        otherCopiesSaved: [],
        otherCopiesSkipped: [],
      };
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
