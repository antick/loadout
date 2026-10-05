import type {
  Skill,
  SourceComparison,
  SourceDiff,
  SourceDiffOptions,
  SourceDocument,
} from "@loadout/shared";
import type { Download, GitClient } from "../install";
import type { ClawhubClient } from "../market/clawhub";
import { readSkillDocument } from "../skills/metadata";
import { libraryCopyOverrides } from "../skills/numbered-name";
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
  clawhub?: ClawhubClient;
}

export interface SourcePreview {
  sourceDiff(skillId: string, options?: SourceDiffOptions): Promise<SourceDiff>;
  compareSource(skillId: string, options?: SourceDiffOptions): Promise<SourceComparison>;
}

function documentOf(skill: Skill, source: OpenedSource): SourceDocument {
  const found = readSkillDocument(source.dir);
  return {
    filename: found?.filename ?? "",
    content: found?.content ?? "",
    sourceLabel: sourceLabel(skill),
    revision: source.revision,
  };
}

/** The library copy of `skill` against the source opened for it, file by file. */
export function diffWithSource(
  skill: Skill,
  source: OpenedSource,
  options: SourceDiffOptions = {},
): SourceDiff {
  return {
    skillId: skill.id,
    sourceLabel: sourceLabel(skill),
    revision: source.revision,
    entries: diffTrees(
      skill.libraryPath,
      source.dir,
      options.asLibraryCopy ? libraryCopyOverrides(source.dir, skill.dirName) : undefined,
    ),
  };
}

/** Look at a skill's upstream without changing anything in the library. */
export function createSourcePreview(deps: SourcePreviewDeps): SourcePreview {
  const { store, git, download } = deps;
  const clients = { git, clawhub: deps.clawhub };

  async function open(skill: Skill): Promise<OpenedSource> {
    if (!isRemoteSource(skill)) return openLocalSource(skill, download);
    const target = remoteTargetOf(skill);
    return openRemoteSource(clients, target, await resolveRemoteRevision(clients, target));
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
    sourceDiff: (skillId, options = {}) =>
      withSource(skillId, (skill, source) => diffWithSource(skill, source, options)),
    compareSource: (skillId, options = {}) =>
      withSource(skillId, (skill, source) => ({
        diff: diffWithSource(skill, source, options),
        document: documentOf(skill, source),
      })),
  };
}
