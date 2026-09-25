import { relative } from "node:path";
import type { GitPreview, RepoSkillPreview, Skill } from "@loadout/shared";
import type { CoreContext } from "../context";
import { cancelled } from "../errors";
import type { SkillStore } from "../skills/store";
import { toPosix } from "../util/fs";
import { listArchiveSkills } from "./archive";
import type { CancelRegistry } from "./cancel";
import type { InstallRecord } from "./library";
import { type PreviewSessions, emitProgress } from "./preview-sessions";
import type { FoundSkill } from "./repo-scan";
import { matchRequested } from "./requested";

/** A folder fetched into a temp place: an unpacked archive, a downloaded file, a site's skills. */
export interface FetchedFolder {
  root: string;
  cleanup(): Promise<void>;
  /** Host of another site the download was sent on to; the user confirms it before installing. */
  redirectedTo?: string | null;
}

export interface FetchedPreviewOptions {
  /** Progress and cancel key: the text exactly as the caller sent it. */
  key: string;
  kind: GitPreview["kind"];
  /** What the preview header shows as the source. */
  shownAs: string;
  fetch(signal: AbortSignal): Promise<FetchedFolder>;
  /** Source fields of a skill at `subpath` of the fetched root (null: the root is the skill). */
  record(subpath: string | null): InstallRecord;
  /** A library skill that came from this same source, so installing it again updates it. */
  installed(skill: Skill): boolean;
  /** Skills named in the typed text, ticked when the list opens. */
  wanted?: readonly string[];
}

export interface FetchedPreviewDeps {
  store: SkillStore;
  cancels: CancelRegistry;
  sessions: PreviewSessions;
}

/** Folder of a skill relative to `root`; null when the skill is the root itself. */
export function subpathOf(root: string, dir: string): string | null {
  return toPosix(relative(root, dir)) || null;
}

/** Preview rows for skills found in a source, marking the ones the library already has. */
export function previewRows(
  store: SkillStore,
  found: FoundSkill[],
  installed: (skill: Skill) => boolean,
): RepoSkillPreview[] {
  return found.map((skill) => ({
    relPath: skill.relPath,
    name: skill.name,
    description: skill.description,
    alreadyInstalled: store.findByName(skill.name).some(installed),
  }));
}

/** Fetch something, list the skills in it and keep it open until the user confirms or cancels. */
export function createFetchedPreviews(
  ctx: CoreContext,
  deps: FetchedPreviewDeps,
): (options: FetchedPreviewOptions) => Promise<GitPreview> {
  const { store, cancels, sessions } = deps;
  return async (options) => {
    const { key } = options;
    const handle = cancels.register(key);
    let cleanup: (() => Promise<void>) | null = null;
    try {
      const fetched = await options.fetch(handle.signal);
      cleanup = fetched.cleanup;
      emitProgress(ctx, key, "scanning");
      const found = listArchiveSkills(fetched.root);
      if (handle.signal.aborted) throw cancelled();
      const redirectedTo = fetched.redirectedTo ?? null;
      const previewId = await sessions.open({
        key,
        dirs: new Map(found.map((skill) => [skill.relPath, skill.dir])),
        record: (dir) => options.record(subpathOf(fetched.root, dir)),
        cleanup: fetched.cleanup,
        redirectedTo,
      });
      cleanup = null;
      return {
        previewId,
        kind: options.kind,
        repoUrl: options.shownAs,
        branch: null,
        revision: null,
        skills: previewRows(store, found, options.installed),
        ...matchRequested(found, options.wanted ?? []),
        redirectedTo,
      };
    } finally {
      await cleanup?.();
      handle.done();
    }
  };
}
