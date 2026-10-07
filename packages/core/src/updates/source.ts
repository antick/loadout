import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import {
  APP_SLUG,
  CLAWHUB_NAME,
  MARKETPLACE_NAME,
  type Skill,
  type SourceType,
  clawhubSkillUrl,
  isArchivePath,
  normalizeSourceUrl,
  redactUrl,
} from "@loadout/shared";
import { AppError, invalid, notFound } from "../errors";
import {
  type Download,
  type GitClient,
  archiveLinkName,
  archiveSkillDir,
  type RedirectRule,
  redirectRule,
  extractArchive,
  fetchWellKnownSkill,
  isWellKnownIndexUrl,
  marketSourceToUrl,
  parseGitSource,
  parseWellKnownIndex,
  validateGitInput,
  resolveSkillDir,
  skillFileFolder,
  skillFileLink,
  unpackArchive,
} from "../install";
import { openClawhubVersion } from "../install/clawhub-install";
import { type ClawhubClient, parseClawhubRef } from "../market/clawhub";
import { isSkillDir, removePath, statOrNull } from "../util/fs";
import { readJson } from "../install/download";
import { subpathOf } from "../install/fetched-preview";

/**
 * Where a library skill's upstream lives and how to open it. Shared by check, update and the
 * source preview so all three agree on what "the source" of a skill is.
 */

const MISSING_SOURCE_REF = "Local skill is missing its original source path";
export const SOURCE_PATH_GONE = "Original source path no longer exists";
/** Revision label of a source that is a folder on this machine. */
const WORKSPACE_REVISION = "workspace";
/** Revision label of an archive link: whatever the link serves right now. */
const LINK_REVISION = "latest";

const SOURCE_LABELS: Record<SourceType, string> = {
  marketplace: MARKETPLACE_NAME,
  clawhub: CLAWHUB_NAME,
  git: "Git",
  local: "Local",
  import: "Imported",
  url: "Link",
};

export function sourceLabel(skill: Pick<Skill, "sourceType">): string {
  return SOURCE_LABELS[skill.sourceType];
}

interface TargetBase {
  url: string;
  branch: string | null;
  subpath: string | null;
  /** Marketplace skills are found by name, because repositories move their folders around. */
  locator: string | null;
}

/**
 * The repository a git or marketplace skill follows, or the registry entry a ClawHub skill does,
 * which ClawHub serves as versioned zips.
 */
export type RemoteTarget =
  | (TargetBase & { kind: "git" })
  | (TargetBase & {
      kind: "clawhub";
      /** Who published the skill, and its slug. */
      clawhub: { owner: string; slug: string };
    });

/** What resolves remote revisions: Git for repositories, the ClawHub client for the registry. */
export interface RemoteClients {
  git: GitClient;
  clawhub?: ClawhubClient;
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
  if (skill.sourceType === "clawhub") {
    const { owner, slug } = parseClawhubRef(skill.sourceRef ?? "");
    return {
      kind: "clawhub",
      url: clawhubSkillUrl(owner, slug),
      branch: null,
      subpath: null,
      locator: null,
      clawhub: { owner, slug },
    };
  }
  if (skill.sourceType === "marketplace") {
    const [source, locator] = splitMarketRef(skill.sourceRef ?? "");
    return {
      kind: "git",
      // A stored URL may come from another device's backup: checked like a typed one.
      url: skill.sourceUrl ? validateGitInput(skill.sourceUrl) : marketSourceToUrl(source),
      branch: skill.sourceBranch,
      subpath: skill.sourceSubpath,
      locator,
    };
  }
  if (skill.sourceType !== "git") throw invalid("This skill does not come from a repository");
  if (skill.sourceUrl) {
    // The URL may come from another device's backup: it gets the same check as a typed one.
    return {
      kind: "git",
      url: validateGitInput(skill.sourceUrl),
      branch: skill.sourceBranch,
      subpath: skill.sourceSubpath,
      locator: null,
    };
  }
  if (!skill.sourceRef) throw invalid("This skill has no repository URL recorded");
  const parsed = parseGitSource(skill.sourceRef);
  return {
    kind: "git",
    url: parsed.cloneUrl,
    branch: skill.sourceBranch ?? parsed.branch,
    subpath: skill.sourceSubpath ?? parsed.subpath,
    locator: null,
  };
}

/** Identity of a remote lookup: skills sharing it share one network call. */
export function remoteKey(target: Pick<RemoteTarget, "kind" | "url" | "branch">): string {
  if (target.kind === "clawhub") return `clawhub\n${target.url}`;
  return `${normalizeSourceUrl(target.url)}\n${target.branch ?? ""}`;
}

function requireClawhub(clients: RemoteClients): ClawhubClient {
  if (!clients.clawhub) throw new AppError("UNSUPPORTED", `${CLAWHUB_NAME} is not available here`);
  return clients.clawhub;
}

/**
 * The commit the remote serves right now, or the latest version on the registry. Throws when
 * the branch or tag is gone.
 */
export async function resolveRemoteRevision(
  clients: RemoteClients,
  target: RemoteTarget,
  signal?: AbortSignal,
): Promise<string> {
  if (target.kind === "clawhub") {
    return requireClawhub(clients).latestVersion(target.clawhub.owner, target.clawhub.slug);
  }
  const { git } = clients;
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

/**
 * Downloads made during one round of checks, by link, so skills taken from the same archive
 * download it once. Pass a fresh map per round.
 */
export type DownloadCache = Map<string, Promise<Buffer>>;

/** Download `link` once per round of checks, keeping to `rule` (see `redirectRule`). */
function cachedDownload(
  download: Download,
  link: string,
  subject: string,
  rule: RedirectRule,
  cache?: DownloadCache,
): Promise<Buffer> {
  let pending = cache?.get(link);
  if (!pending) {
    pending = download(link, { subject, onRedirect: rule.watch(link) });
    cache?.set(link, pending);
  }
  return pending;
}

/**
 * At install the user saw where a link's download went, and agreed to any other site. An update
 * asks no one, so it keeps to exactly that: the same rule, with the site the install recorded.
 */
function updateRule(skill: Skill): RedirectRule {
  return redirectRule("update", skill.sourceTrustedHost);
}

const SITE_CHECK_PREFIX = `${APP_SLUG}-site-check-`;

/** Find the skill again in the index of the site it came from, and download it. */
async function openSiteSource(
  skill: Skill,
  indexUrl: string,
  download: Download,
  cache?: DownloadCache,
): Promise<OpenedSource> {
  const name = skill.sourceSubpath;
  if (!name) throw invalid("This skill does not record its name on the site it came from");
  const rule = updateRule(skill);
  const data = await cachedDownload(download, indexUrl, "The skills index", rule, cache);
  const entries = parseWellKnownIndex(readJson(data, indexUrl), indexUrl);
  if (!entries) throw invalid(`${redactUrl(indexUrl)} is no longer a skills index`);
  const entry = entries.find((candidate) => candidate.name === name);
  if (!entry) throw notFound(`${name} is no longer published at ${new URL(indexUrl).host}`);
  const root = await mkdtemp(join(tmpdir(), SITE_CHECK_PREFIX));
  const cleanup = (): Promise<void> => removePath(root).catch(() => undefined);
  try {
    const dir = await fetchWellKnownSkill(download, entry, join(root, name), rule);
    return { dir, revision: LINK_REVISION, subpath: name, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

/** Download a lone `SKILL.md` again. */
async function openSkillFileSource(
  link: string,
  download: Download,
  rule: RedirectRule,
  cache?: DownloadCache,
): Promise<OpenedSource> {
  const folder = await skillFileFolder(
    link,
    await cachedDownload(download, link, "The file", rule, cache),
  );
  return { dir: folder.root, revision: LINK_REVISION, subpath: null, cleanup: folder.cleanup };
}

async function openLinkSource(
  skill: Skill,
  download: Download,
  cache?: DownloadCache,
): Promise<OpenedSource> {
  const link = skill.sourceRef;
  if (!link) throw invalid(MISSING_SOURCE_REF);
  if (isWellKnownIndexUrl(skill.sourceUrl)) {
    return openSiteSource(skill, skill.sourceUrl, download, cache);
  }
  if (skillFileLink(link)) {
    return openSkillFileSource(link, download, updateRule(skill), cache);
  }
  const pending = cachedDownload(download, link, "The archive", updateRule(skill), cache);
  const archive = await unpackArchive(await pending, archiveLinkName(link));
  try {
    return {
      dir: archiveSkillDir(archive.root, skill.sourceSubpath),
      revision: LINK_REVISION,
      subpath: skill.sourceSubpath,
      cleanup: archive.cleanup,
    };
  } catch (error) {
    await archive.cleanup();
    throw error;
  }
}

/**
 * Open what a skill without a repository was installed from: its folder, its archive file
 * (the recorded skill inside it, for archives holding several), or its archive link.
 */
export async function openLocalSource(
  skill: Skill,
  download: Download,
  cache?: DownloadCache,
): Promise<OpenedSource> {
  if (skill.sourceType === "url") return openLinkSource(skill, download, cache);
  const ref = skill.sourceRef;
  if (!ref) throw invalid(MISSING_SOURCE_REF);
  const stat = isAbsolute(ref) ? statOrNull(ref) : null;
  if (!stat) throw notFound(SOURCE_PATH_GONE);
  if (stat.isDirectory()) {
    return { dir: ref, revision: WORKSPACE_REVISION, subpath: null, cleanup: noCleanup };
  }
  if (!isArchivePath(ref)) throw invalid(`The original source is not a folder or archive: ${ref}`);
  const archive = await extractArchive(ref, skill.sourceSubpath);
  return {
    dir: archive.skillDir,
    revision: WORKSPACE_REVISION,
    subpath: skill.sourceSubpath,
    cleanup: archive.cleanup,
  };
}

/**
 * Check the repository out at `revision` and find the skill's folder in it; or download that
 * version of a registry skill.
 */
export async function openRemoteSource(
  clients: RemoteClients,
  target: RemoteTarget,
  revision: string,
  signal?: AbortSignal,
): Promise<OpenedSource> {
  if (target.kind === "clawhub") {
    const { owner, slug } = target.clawhub;
    const opened = await openClawhubVersion(requireClawhub(clients), owner, slug, revision, signal);
    return { dir: opened.dir, revision, subpath: null, cleanup: opened.cleanup };
  }
  const { git } = clients;
  const checkout = await git.checkout(target.url, {
    branch: target.branch,
    revision,
    signal,
    // Found by its SKILL.md; then only the skill's own folder is fetched in full.
    manifestsOnly: true,
  });
  try {
    const dir = resolveSkillDir(checkout.dir, target.subpath, target.locator);
    // Without a locator the resolver hands back the repository root, which may not be a skill.
    if (!isSkillDir(dir)) throw notFound("The skill is no longer in the repository");
    await checkout.materialize([dir]);
    return {
      dir,
      revision: checkout.revision,
      subpath: subpathOf(checkout.dir, dir),
      cleanup: checkout.cleanup,
    };
  } catch (error) {
    await checkout.cleanup();
    throw error;
  }
}
