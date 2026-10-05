import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import {
  DEFAULT_PUBLISH_LAYER,
  PUBLISH_LAYERS,
  PUBLISH_LAYER_DIRS,
  type PublishLayer,
  normalizeSourceUrl,
} from "@loadout/shared";
import { type ParsedRemote, parseRemoteUrl } from "../backup/credentials";
import type { CoreContext } from "../context";
import { invalid } from "../errors";
import { INTERNAL_KEYS } from "../settings/store";
import { pathsOverlap } from "../util/fs";

/** Where a publish goes, with every part of the input checked. */

const CACHE_KEY_LENGTH = 16;
const PUBLISH_CACHE_DIR = "publish";

/** Where the working copies of publishing targets live, one folder per repository and branch. */
export function publishCacheRoot(ctx: CoreContext): string {
  return join(ctx.paths.cacheDir, PUBLISH_CACHE_DIR);
}
const TOKEN_IN_ADDRESS =
  "Leave the token out of the address. Loadout sends the token saved for that host under Backup, or uses your SSH key or Git credential helper.";
const OWN_BACKUP =
  "That is this library's own backup repository. Publishing there would mix a few skills into the backup. Choose another repository.";
const OWN_LIBRARY = "That folder is inside this library. Choose a repository outside it.";

export interface ResolvedTarget {
  /** Address given to git: credentials removed. */
  url: string;
  remote: ParsedRemote;
  /** As given; the checkout asks git whether it is a name. Null: the repository's own default. */
  branch: string | null;
  layer: PublishLayer;
  /** Folder of the layer inside the repository, `/` separated. */
  layerDir: string;
  /** Where the working copy for this repository is kept between publishes. */
  cacheDir: string;
}

/**
 * The real path of the deepest part that exists, with the rest appended: two spellings of one
 * place (`/var` and `/private/var`) compare equal even when the folder is not there yet.
 */
function realPathOf(path: string): string {
  const full = resolve(path);
  try {
    return realpathSync(full);
  } catch {
    const parent = dirname(full);
    return parent === full ? full : join(realPathOf(parent), basename(full));
  }
}

/** The spelling of an address that two spellings of one repository share. */
function identityOf(remote: ParsedRemote): string {
  return remote.path === null ? normalizeSourceUrl(remote.cleanUrl) : realPathOf(remote.path);
}

/** The saved backup address is the same repository as `remote`. */
function isBackupRepository(ctx: CoreContext, remote: ParsedRemote): boolean {
  const backup = ctx.settings.getRaw<string | null>(INTERNAL_KEYS.backupRemoteUrl, null);
  if (!backup) return false;
  try {
    return identityOf(parseRemoteUrl(backup)) === identityOf(remote);
  } catch {
    // A saved address that no longer parses cannot be the same repository.
    return false;
  }
}

export function resolveTarget(
  ctx: CoreContext,
  input: { repo: string; branch?: string | null; layer?: PublishLayer },
): ResolvedTarget {
  const remote = parseRemoteUrl(input.repo);
  if (remote.token) throw invalid(TOKEN_IN_ADDRESS);
  const layer = input.layer ?? DEFAULT_PUBLISH_LAYER;
  if (!PUBLISH_LAYERS.includes(layer)) throw invalid(`"${String(layer)}" is not a layer.`);

  if (remote.path !== null) {
    if (!isAbsolute(remote.path)) throw invalid("Give the full path of the folder.");
    if (pathsOverlap(realPathOf(remote.path), realPathOf(ctx.paths.baseDir))) {
      throw invalid(OWN_LIBRARY);
    }
  }
  if (isBackupRepository(ctx, remote)) throw invalid(OWN_BACKUP);

  const key = createHash("sha256").update(identityOf(remote)).digest("hex");
  return {
    url: remote.cleanUrl,
    remote,
    branch: input.branch?.trim() || null,
    layer,
    layerDir: PUBLISH_LAYER_DIRS[layer],
    cacheDir: join(publishCacheRoot(ctx), key.slice(0, CACHE_KEY_LENGTH)),
  };
}
