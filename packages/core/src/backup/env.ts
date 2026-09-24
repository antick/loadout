import { readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CoreContext } from "../context";
import { INTERNAL_KEYS } from "../settings/store";
import type { PortableMetadata, PortableSkill } from "../skills/portable";
import type { SkillStore } from "../skills/store";
import { readDirSafe } from "../util/fs";
import { trySanitizeSkillName } from "../util/names";
import { readDeviceName } from "./device";
import { type Git, createGit } from "./git";

export const REMOTE_NAME = "origin";
export const DEFAULT_BRANCH = "main";
/** Folder names inside the repository that belong to the app, not to a skill. */
export const SKILL_METADATA_SUBDIR = "skills";
export const PRESET_METADATA_SUBDIR = "presets";

/**
 * A folder name that arrived from another device is only trusted when it is one plain name.
 * Anything with a separator, `..` or a leading dot could point outside the library or at our
 * own metadata.
 */
export function isSafeSkillPath(path: unknown): path is string {
  return typeof path === "string" && !path.startsWith(".") && trySanitizeSkillName(path) === path;
}

export interface BackupDeps {
  store: SkillStore;
  portable: PortableMetadata;
  /** Core refreshes copy-mode deployments here after skill content was replaced. */
  afterContentChange: () => Promise<void> | void;
  fetchImpl?: typeof fetch;
  hooks?: BackupHooks;
}

/** Seams for tests that need to act in a race window. Unused in the app. */
export interface BackupHooks {
  /** Runs after the merge step and right before each push attempt. */
  beforePush?: (attempt: number) => Promise<void>;
}

/** What every backup module works with. Built once per service. */
export interface BackupEnv {
  ctx: CoreContext;
  store: SkillStore;
  portable: PortableMetadata;
  git: Git;
  /** Root of the repository: the skills folder. */
  repoDir: string;
  /** Folder temporary and set-aside folders are created in (same disk as the repository). */
  siblingDir: string;
  /** Name of the portable metadata folder inside the repository. */
  metadataName: string;
  hooks: BackupHooks;
  deviceName(): string;
  remoteUrl(): string | null;
  /**
   * The files changed underneath the database (clone, merge, restore, conflict choice):
   * rebuild it from them, refresh deployed copies and tell the UI.
   */
  reconcile(authoritative: boolean): Promise<void>;
}

export function createBackupEnv(ctx: CoreContext, deps: BackupDeps): BackupEnv {
  const repoDir = ctx.paths.skillsDir;
  const deviceName = (): string => readDeviceName(ctx.settings);
  const remoteUrl = (): string | null =>
    ctx.settings.getRaw<string | null>(INTERNAL_KEYS.backupRemoteUrl, null) || null;

  function metadataFiles(): { path: string; file: PortableSkill }[] {
    const dir = join(ctx.paths.metadataDir, SKILL_METADATA_SUBDIR);
    const found: { path: string; file: PortableSkill }[] = [];
    for (const entry of readDirSafe(dir)) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const path = join(dir, entry.name);
      try {
        const file: unknown = JSON.parse(readFileSync(path, "utf8"));
        if (typeof file === "object" && file !== null)
          found.push({ path, file: file as PortableSkill });
      } catch {
        // The rebuild skips unreadable metadata too.
      }
    }
    return found;
  }

  /**
   * Metadata that came in with a clone, merge or restore is another device's word. The rebuild
   * joins `path` onto the library folder as it is, so a file naming a folder outside the library
   * is removed before the rebuild can index (and later delete) something that is not ours.
   */
  function dropUnsafeMetadata(): void {
    for (const { path, file } of metadataFiles()) {
      if (isSafeSkillPath(file.path)) continue;
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
      const revision = file.source?.revision ?? null;
      if (!skill || skill.sourceRevision === revision) continue;
      deps.store.update(skill.id, { sourceRevision: revision, updatedAt: skill.updatedAt });
    }
  }

  return {
    ctx,
    store: deps.store,
    portable: deps.portable,
    repoDir,
    siblingDir: dirname(repoDir),
    metadataName: ctx.paths.metadataDir.slice(repoDir.length + 1),
    hooks: deps.hooks ?? {},
    deviceName,
    remoteUrl,
    git: createGit({
      repoDir,
      secrets: ctx.secrets,
      deviceName,
      proxy: () => ctx.settings.proxy(),
      remoteUrl,
    }),
    reconcile: async (authoritative) => {
      dropUnsafeMetadata();
      deps.portable.rebuild({ authoritative });
      adoptRevisions();
      await deps.afterContentChange();
      ctx.touched("skills", "presets", "backup");
    },
  };
}
