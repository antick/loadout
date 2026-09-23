import type { Skill, SourceDiff, SourceDocument } from "@loadout/shared";
import type { Download, GitClient } from "../install";
import { readSkillDocument } from "../skills/metadata";
import type { SkillStore } from "../skills/store";
import { diffTrees } from "./diff";
import {
  type OpenedSource,
  isRemoteSource,
  openLocalSource,
  openRemoteSource,
  remoteTargetOf,
  resolveRemoteRevision,
  sourceLabel,
} from "./source";

export interface SourcePreviewDeps {
  store: SkillStore;
  git: GitClient;
  download: Download;
}

export interface SourcePreview {
  sourceDocument(skillId: string): Promise<SourceDocument>;
  sourceDiff(skillId: string): Promise<SourceDiff>;
}

/** Look at a skill's upstream without changing anything in the library. */
export function createSourcePreview(deps: SourcePreviewDeps): SourcePreview {
  const { store, git, download } = deps;

  async function open(skill: Skill): Promise<OpenedSource> {
    if (!isRemoteSource(skill)) return openLocalSource(skill, download);
    const target = remoteTargetOf(skill);
    return openRemoteSource(git, target, await resolveRemoteRevision(git, target));
  }

  /** Temp checkouts are removed however `read` ends. */
  async function withSource<T>(skillId: string, read: (skill: Skill, source: OpenedSource) => T) {
    const skill = store.get(skillId);
    const source = await open(skill);
    try {
      return read(skill, source);
    } finally {
      await source.cleanup();
    }
  }

  return {
    sourceDocument: (skillId) =>
      withSource(skillId, (skill, source) => {
        const found = readSkillDocument(source.dir);
        return {
          filename: found?.filename ?? "",
          content: found?.content ?? "",
          sourceLabel: sourceLabel(skill),
          revision: source.revision,
        };
      }),

    sourceDiff: (skillId) =>
      withSource(skillId, (skill, source) => ({
        skillId: skill.id,
        sourceLabel: sourceLabel(skill),
        revision: source.revision,
        entries: diffTrees(skill.libraryPath, source.dir),
      })),
  };
}
