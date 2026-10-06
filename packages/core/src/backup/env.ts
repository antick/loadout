import { unlinkSync } from "node:fs";

import { dirname, join } from "node:path";

import { GIT_DEFAULT_BRANCH, GIT_REMOTE_NAME, isRecord } from "@loadout/shared";

import type { CoreContext } from "../context";
import { INTERNAL_KEYS } from "../settings/store";

import {
  type PortableMetadata,
  type PortableSkillFile,
  type RebuildMode,
  readPortableSkillFiles,
} from "../skills/portable";

import type { SkillStore } from "../skills/store";
import type { RemovedStore } from "../storage/removed";
import { readDeviceName } from "./device";

import { BACKUP_ERROR_TEXT, BACKUP_GIT_CONFIG, type Git, createGit } from "./git";

import { isSkillFolderName } from "../util/safe-path";

/** The backup's remote and branch: the git conventions every Loadout repository follows. */
export const REMOTE_NAME = GIT_REMOTE_NAME;
export const DEFAULT_BRANCH = GIT_DEFAULT_BRANCH;
/** Folder names inside the repository that belong to the app, not to a skill. */
export const SKILL_METADATA_SUBDIR = "skills";
export const PRESET_METADATA_SUBDIR = "presets";

export interface BackupDeps {
  store: SkillStore;
  portable: PortableMetadata;
  /** Skills another device deleted are kept here, so they can be put back. */
  removed: RemovedStore;
  /** Core refreshes copy-mode deployments here after skill content was replaced. */
  afterContentChange: () => Promise<void> | void;
  fetchImpl?: typeof fetch;
}

/** What every backup module works with. Built once per service. */
export interface BackupEnv {
  ctx: CoreContext;
  store: SkillStore;
  portable: PortableMetadata;
  removed: RemovedStore;
  git: Git;
  /** Root of the repository: the skills folder. */
  repoDir: string;
  /** Folder temporary and set-aside folders are created in (same disk as the repository). */
  siblingDir: string;
  /** Name of the portable metadata folder inside the repository. */
  metadataName: string;
  deviceName(): string;
  remoteUrl(): string | null;
  /**
   * The files changed underneath the database (clone, merge, restore, conflict choice):
   * rebuild it from them, refresh deployed copies and tell the UI.
   */
  reconcile(mode: RebuildMode): Promise<void>;
}

export function createBackupEnv(ctx: CoreContext, deps: BackupDeps): BackupEnv {
  const repoDir = ctx.paths.skillsDir;
  const deviceName = (): string => readDeviceName(ctx.settings);
  const remoteUrl = (): string | null =>
    ctx.settings.getRaw<string | null>(INTERNAL_KEYS.backupRemoteUrl, null) || null;

  const metadataFiles = (): PortableSkillFile[] =>
    readPortableSkillFiles(join(ctx.paths.metadataDir, SKILL_METADATA_SUBDIR));

  /**
   * Metadata that came in with a clone, merge or restore is another device's word. The rebuild
   * joins `path` onto the library folder as it is, so a file naming a folder outside the library
   * is removed before the rebuild can index (and later delete) something that is not ours.
   */
  function dropUnsafeMetadata(): void {
    for (const { path, file } of metadataFiles()) {
      if (isSkillFolderName(file.path)) continue;
      ctx.log.warn(`Removed backup metadata pointing outside the library: ${path}`);
      unlinkSync(path);
    }
  }

  /**
   * A rebuild refreshes an existing skill from its files but keeps the installed revision it
   * already had. After a merge that would make the next metadata write undo the other device's
   * revision, and the two devices would trade commits for ever. So carry it over here.
   */
  function adoptRevisions(): void {
    for (const { file } of metadataFiles()) {
      const skill = typeof file.id === "string" ? deps.store.find(file.id) : null;
      const revision =
        isRecord(file.source) && typeof file.source.revision === "string"
          ? file.source.revision
          : null;
      if (!skill || skill.sourceRevision === revision) continue;
      deps.store.update(skill.id, { sourceRevision: revision });
    }
  }

  return {
    ctx,
    store: deps.store,
    portable: deps.portable,
    removed: deps.removed,
    repoDir,
    siblingDir: dirname(repoDir),
    metadataName: ctx.paths.metadataDir.slice(repoDir.length + 1),
    deviceName,
    remoteUrl,
    git: createGit({
      repoDir,
      config: BACKUP_GIT_CONFIG,
      errorText: BACKUP_ERROR_TEXT,
      secrets: ctx.secrets,
      deviceName,
      proxy: () => ctx.settings.proxy(),
      github: ctx.github,
      remoteUrl,
    }),
    reconcile: async (mode) => {
      dropUnsafeMetadata();
      deps.portable.rebuild({ mode });
      adoptRevisions();
      await deps.afterContentChange();
      ctx.touched("skills", "presets", "backup");
    },
  };
}
