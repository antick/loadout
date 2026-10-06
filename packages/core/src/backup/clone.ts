import { existsSync, renameSync } from "node:fs";
import { basename, join } from "node:path";
import { formatTimestampCompact, firstFreeName } from "@loadout/shared";
import { exists } from "../errors";
import { INTERNAL_KEYS } from "../settings/store";
import { readPortableSkillFiles } from "../skills/portable";
import {
  GIT_DIR,
  copyDir,
  ensureDir,
  isSkillDir,
  readDirSafe,
  removePath,
  statOrNull,
  GIT_IGNORE_FILE,
} from "../util/fs";
import { hashDir, hashFile, holdsUncopiedEntries, sameUnhashedEntries } from "../util/hash";
import { assertReadable, schemaAt } from "./compat";
import { sanitizeRemoteUrl } from "./credentials";
import { type BackupEnv, DEFAULT_BRANCH, REMOTE_NAME, SKILL_METADATA_SUBDIR } from "./env";
import { isRepo } from "./repo";

/**
 * Adopt an existing backup. The remote is cloned next to the library first (the slow, fallible
 * part), then the two folders are swapped. Skills that only exist on this device are carried
 * over, so restoring a backup never costs local work.
 */

const CLONE_DIR_PREFIX = "skills.clone-";
/** In `paths.earlierDir`: the library a restore or recovery replaced. */
const SET_ASIDE_PREFIX = "skills-";
const LOCAL_COPY_SUFFIX = "-local";

export interface CloneOptions {
  /**
   * Recovery of a library that already is a repository: allowed although `.git` exists, and the
   * current folder is always kept next to the new one.
   */
  keepCurrent: boolean;
}

function freeName(dir: string, prefix: string): string {
  const stamp = formatTimestampCompact(Date.now());
  return join(
    dir,
    firstFreeName(`${prefix}${stamp}`, (name) => !existsSync(join(dir, name))),
  );
}

/** Folder name → skill id, from the clone's portable metadata. */
function remoteSkillIds(env: BackupEnv, cloneDir: string): Map<string, string> {
  const ids = new Map<string, string>();
  for (const { file } of readPortableSkillFiles(
    join(cloneDir, env.metadataName, SKILL_METADATA_SUBDIR),
  )) {
    if (typeof file.path === "string" && typeof file.id === "string") ids.set(file.path, file.id);
  }
  return ids;
}

interface Carried {
  /** Every local entry is now in the clone (or identical to what the clone has). */
  complete: boolean;
  /** Database changes to make once the swap has really happened. */
  adjustments: (() => void)[];
}

/**
 * Copy what only this device has into the clone. An entry the backup does not have goes in as it
 * is. When both have a skill folder, the backup's version keeps the name and a differing local
 * one is kept beside it as `<name>-local`. Always a copy: the current library stays whole until
 * the swap has worked.
 */
async function carryLocalEntries(env: BackupEnv, cloneDir: string): Promise<Carried> {
  const remoteIds = remoteSkillIds(env, cloneDir);
  const carried: Carried = { complete: true, adjustments: [] };

  for (const entry of readDirSafe(env.repoDir)) {
    // Git's folder and our metadata are rebuilt, never carried.
    if (entry.name === GIT_DIR || entry.name === env.metadataName) continue;
    const local = join(env.repoDir, entry.name);
    const incoming = join(cloneDir, entry.name);
    if (entry.isSymbolicLink()) {
      // Links are never followed; remember that something was left behind.
      carried.complete = false;
      continue;
    }
    // A copy leaves `.git` folders behind: the old library then holds the only one.
    if (entry.isDirectory() && holdsUncopiedEntries(local, { copiesLinks: true })) {
      carried.complete = false;
    }
    if (!existsSync(incoming)) {
      await copyDir(local, incoming);
      continue;
    }
    if (!entry.isDirectory() || !isSkillDir(local)) {
      // A plain file both sides have: the backup's wins. `.gitignore` is regenerated; any other
      // file that differs is only in the old library, which must then be kept.
      const same =
        entry.isFile() &&
        statOrNull(incoming)?.isFile() === true &&
        hashFile(local) === hashFile(incoming);
      if (entry.isDirectory() || (entry.name !== GIT_IGNORE_FILE && !same))
        carried.complete = false;
      continue;
    }

    const row = env.store.findByLibraryPath(local);
    const sameSkill = row !== null && remoteIds.get(entry.name) === row.id;
    if (hashDir(local) !== hashDir(incoming)) {
      const name = firstFreeName(
        `${entry.name}${LOCAL_COPY_SUFFIX}`,
        (candidate) =>
          !existsSync(join(cloneDir, candidate)) && !existsSync(join(env.repoDir, candidate)),
      );
      await copyDir(local, join(cloneDir, name));
      // A different skill that happened to share the name keeps its identity under the new name.
      // The same skill with unsaved local edits stays with the backup; the copy is indexed as new.
      if (row && !sameSkill) {
        carried.adjustments.push(() => {
          env.store.patch(row.id, { libraryPath: join(env.repoDir, name) });
        });
      }
      continue;
    }
    // The hash does not see links or `.gitignore` files: ones the backup lacks are only here.
    if (!sameUnhashedEntries(local, incoming)) carried.complete = false;
    if (row && !sameSkill) {
      // Identical content under another id: the backup's identity wins, or presets synced from
      // other devices would point at a skill this device does not know.
      carried.adjustments.push(() => env.store.delete(row.id));
    }
  }
  return carried;
}

async function cloneInto(env: BackupEnv, url: string, cloneDir: string): Promise<void> {
  await env.git.run(["clone", "--origin", REMOTE_NAME, "--", url, cloneDir], {
    network: true,
    remoteUrl: url,
    cwd: env.siblingDir,
  });
  const inClone = { cwd: cloneDir };
  if ((await env.git.probe(["rev-parse", "-q", "--verify", "HEAD"], inClone)).code === 0) return;
  // Nothing was checked out: the remote is empty, or its HEAD names a branch it does not have.
  const upstream = `${REMOTE_NAME}/${DEFAULT_BRANCH}`;
  const hasDefault = await env.git.probe(
    ["rev-parse", "-q", "--verify", `refs/remotes/${upstream}`],
    inClone,
  );
  if (hasDefault.code === 0) {
    await env.git.run(["checkout", "-q", "-B", DEFAULT_BRANCH, "--track", upstream], inClone);
  } else {
    await env.git.run(["symbolic-ref", "HEAD", `refs/heads/${DEFAULT_BRANCH}`], inClone);
  }
}

/** Returns the folder the previous library was set aside in, or null when it was removed. */
export async function cloneLibrary(
  env: BackupEnv,
  inputUrl: string,
  options: CloneOptions,
): Promise<string | null> {
  if (!options.keepCurrent && isRepo(env)) {
    throw exists("This library is already backed up. Use the recovery option to clone again.");
  }
  const url = await sanitizeRemoteUrl(env.ctx.secrets, inputUrl);
  const cloneDir = freeName(env.siblingDir, CLONE_DIR_PREFIX);
  // Shown and cleared in Settings, Storage, and moved with the library; never left unseen.
  const earlierDir = env.ctx.paths.earlierDir;
  const asideDir = freeName(earlierDir, SET_ASIDE_PREFIX);

  try {
    await cloneInto(env, url, cloneDir);
    assertReadable(await schemaAt(env, "HEAD", cloneDir));
  } catch (error) {
    await removePath(cloneDir);
    throw error;
  }

  const keptAside = await env.ctx.lock.run("backup clone", async () => {
    let carried: Carried;
    try {
      carried = await carryLocalEntries(env, cloneDir);
      ensureDir(earlierDir);
      renameSync(env.repoDir, asideDir);
    } catch (error) {
      await removePath(cloneDir);
      throw error;
    }
    try {
      renameSync(cloneDir, env.repoDir);
    } catch (error) {
      renameSync(asideDir, env.repoDir);
      await removePath(cloneDir);
      throw error;
    }
    for (const adjust of carried.adjustments) adjust();
    env.ctx.settings.setRaw(INTERNAL_KEYS.backupRemoteUrl, url);
    // An adopted library is only removed once everything in it is known to be in the new one.
    const keep = options.keepCurrent || !carried.complete;
    if (!keep) await removePath(asideDir);
    // Not authoritative: the carried-over skills have no metadata yet and must be indexed.
    await env.reconcile("adopt");
    return keep ? asideDir : null;
  });

  env.ctx.activity.record("restore", basename(url), keptAside ? `Kept ${keptAside}` : null);
  return keptAside;
}
