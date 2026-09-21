import { isAbsolute, relative } from "node:path";
import { MARKETPLACE_NAME, type Skill, type SourceType } from "@loadout/shared";
import { AppError, invalid, notFound } from "../errors";
import {
  type GitClient,
  extractArchive,
  isArchivePath,
  marketSourceToUrl,
  normalizeRepoUrl,
  parseGitSource,
  redactUrl,
  resolveSkillDir,
} from "../install";
import { isSkillDir, statOrNull, toPosix } from "../util/fs";

/**
 * Where a library skill's upstream lives and how to open it. Shared by check, update and the
 * source preview so all three agree on what "the source" of a skill is.
 */

export const MISSING_SOURCE_REF = "Local skill is missing its original source path";
export const SOURCE_PATH_GONE = "Original source path no longer exists";
/** Revision label of a source that is a folder on this machine. */
export const WORKSPACE_REVISION = "workspace";

const REMOTE_TYPES: ReadonlySet<SourceType> = new Set(["git", "marketplace"]);
const SOURCE_LABELS: Record<SourceType, string> = {
  marketplace: MARKETPLACE_NAME,
  git: "Git",
  local: "Local",
  import: "Imported",
};

export function isRemoteSource(skill: Pick<Skill, "sourceType">): boolean {
  return REMOTE_TYPES.has(skill.sourceType);
}

export function sourceLabel(skill: Pick<Skill, "sourceType">): string {
  return SOURCE_LABELS[skill.sourceType];
}

/** The repository a git or marketplace skill follows. */
export interface RemoteTarget {
  url: string;
  branch: string | null;
  subpath: string | null;
  /** Marketplace skills are found by name, because repositories move their folders around. */
  locator: string | null;
}

/** `owner/repo/skill` → [`owner/repo`, `skill`]. */
function splitMarketRef(ref: string): [source: string, locator: string] {
  const cut = ref.lastIndexOf("/");
  if (cut <= 0 || cut === ref.length - 1) throw invalid(`Invalid marketplace source: '${ref}'`);
  return [ref.slice(0, cut), ref.slice(cut + 1)];
}

/**
 * Resolve the remote of a git or marketplace skill: the stored clone URL when there is one, else
 * whatever the original reference parses to. Throws INVALID_INPUT when neither is usable.
 */
export function remoteTargetOf(skill: Skill): RemoteTarget {
  if (skill.sourceType === "marketplace") {
    const [source, locator] = splitMarketRef(skill.sourceRef ?? "");
    return {
      url: skill.sourceUrl ?? marketSourceToUrl(source),
      branch: skill.sourceBranch,
      subpath: skill.sourceSubpath,
      locator,
    };
  }
  if (skill.sourceType !== "git") throw invalid("This skill does not come from a repository");
  if (skill.sourceUrl) {
    return {
      url: skill.sourceUrl,
      branch: skill.sourceBranch,
      subpath: skill.sourceSubpath,
      locator: null,
    };
  }
  if (!skill.sourceRef) throw invalid("This skill has no repository URL recorded");
  const parsed = parseGitSource(skill.sourceRef);
  return {
    url: parsed.cloneUrl,
    branch: skill.sourceBranch ?? parsed.branch,
    subpath: skill.sourceSubpath ?? parsed.subpath,
    locator: null,
  };
}

/** Identity of a remote lookup: skills sharing it share one network call. */
export function remoteKey(target: Pick<RemoteTarget, "url" | "branch">): string {
  return `${normalizeRepoUrl(target.url)}\n${target.branch ?? ""}`;
}

/** The commit the remote serves right now. Throws when the branch or tag is gone. */
export async function resolveRemoteRevision(
  git: GitClient,
  target: RemoteTarget,
  signal?: AbortSignal,
): Promise<string> {
  const sha = await git.lsRemote(target.url, { branch: target.branch, signal });
  if (sha) return sha;
  const what = target.branch ? `'${target.branch}'` : "The default branch";
  throw new AppError("GIT", `${what} no longer exists in ${redactUrl(target.url)}`);
}

/** A source folder ready to be read. Always call `cleanup`. */
export interface OpenedSource {
  dir: string;
  revision: string;
  /** Folder of the skill inside its repository; null for the root and for local sources. */
  subpath: string | null;
  cleanup(): Promise<void>;
}

const noCleanup = async (): Promise<void> => undefined;

/** Open the folder (or unpack the archive) a local or imported skill was installed from. */
export async function openLocalSource(skill: Skill): Promise<OpenedSource> {
  const ref = skill.sourceRef;
  if (!ref) throw invalid(MISSING_SOURCE_REF);
  const stat = isAbsolute(ref) ? statOrNull(ref) : null;
  if (!stat) throw notFound(SOURCE_PATH_GONE);
  if (stat.isDirectory()) {
    return { dir: ref, revision: WORKSPACE_REVISION, subpath: null, cleanup: noCleanup };
  }
  if (!isArchivePath(ref)) throw invalid(`The original source is not a folder or archive: ${ref}`);
  const archive = await extractArchive(ref);
  return {
    dir: archive.skillDir,
    revision: WORKSPACE_REVISION,
    subpath: null,
    cleanup: archive.cleanup,
  };
}

/** Check the repository out at `revision` and find the skill's folder in it. */
export async function openRemoteSource(
  git: GitClient,
  target: RemoteTarget,
  revision: string,
  signal?: AbortSignal,
): Promise<OpenedSource> {
  const checkout = await git.checkout(target.url, {
    branch: target.branch,
    revision,
    subpath: target.subpath,
    signal,
  });
  try {
    const dir = resolveSkillDir(checkout.dir, target.subpath, target.locator);
    // Without a locator the resolver may hand back a container folder; that is not the skill.
    if (!isSkillDir(dir)) throw notFound("The skill is no longer in the repository");
    return {
      dir,
      revision: checkout.revision,
      subpath: toPosix(relative(checkout.dir, dir)) || null,
      cleanup: checkout.cleanup,
    };
  } catch (error) {
    await checkout.cleanup();
    throw error;
  }
}
