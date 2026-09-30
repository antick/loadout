import {
  type SourceCandidate,
  type SourceMatchKind,
  SOURCE_SIMILAR_RATIO,
  repositoryLabel,
} from "@loadout/shared";
import { isAppError, notFound } from "../errors";
import { type GitClient, parseGitSource, redactUrl, resolveTreeRef } from "../install";
import type { InstalledSnapshot } from "../skills/store";
import { readSkillDocument } from "../skills/metadata";
import { hashAsLibraryCopy, libraryCopyOverrides } from "../skills/numbered-name";
import { diffTrees } from "../updates/diff";
import {
  type OpenedSource,
  type RemoteTarget,
  openRemoteSource,
  resolveRemoteRevision,
} from "../updates/source";
import { fileDigests, hashDir, sha256Hex } from "../util/hash";
import type { SourceLead } from "./evidence";
import { textSimilarity } from "./similarity";

/** The library side of a comparison: the skill as it is on disk right now. */
export interface LibrarySide {
  name: string;
  dirName: string;
  libraryPath: string;
}

/** A lead checked out and compared. */
export interface ComparedLead {
  candidate: SourceCandidate;
  /** Hash of the library folder the comparison saw. */
  libraryHash: string | null;
  /** What the candidate holds, as the library would keep it: for the snapshot of a link. */
  upstream: InstalledSnapshot;
}

const EOL_INSENSITIVE = { ignoreLineEndings: true } as const;
const NUMBERED = /^(.+)-\d+$/;

/** Where a lead points, once a tree link's branch and folder are told apart. */
async function targetOf(
  git: GitClient,
  lead: SourceLead,
  skillName: string,
): Promise<RemoteTarget> {
  const parsed = parseGitSource(lead.input);
  let branch = parsed.branch;
  let subpath = parsed.subpath;
  if (parsed.treeTail) {
    ({ branch, subpath } = await resolveTreeRef(parsed.cloneUrl, parsed.treeTail, (url) =>
      git.listRefs(url),
    ));
  }
  // A numbered library copy (`pdf-2`) is still called `pdf` upstream.
  const baseName = NUMBERED.exec(skillName)?.[1] ?? skillName;
  return {
    kind: "git",
    url: parsed.cloneUrl,
    branch: lead.branch ?? branch,
    subpath: lead.subpath ?? subpath,
    locator: lead.locator ?? parsed.skill ?? baseName,
  };
}

/**
 * The commit to compare with. A local checkout's branch may never have been pushed: then the
 * repository's default branch is the next best thing.
 */
async function revisionOf(
  git: GitClient,
  target: RemoteTarget,
  lead: SourceLead,
): Promise<{ target: RemoteTarget; revision: string }> {
  if (lead.evidence === "git_folder" && target.branch) {
    const sha = await git.lsRemote(target.url, { branch: target.branch });
    if (sha) return { target, revision: sha };
    const fallback = { ...target, branch: null };
    return { target: fallback, revision: await resolveRemoteRevision({ git }, fallback) };
  }
  return { target, revision: await resolveRemoteRevision({ git }, target) };
}

async function open(
  git: GitClient,
  target: RemoteTarget,
  revision: string,
  locator: string,
): Promise<OpenedSource> {
  try {
    return await openRemoteSource({ git }, target, revision);
  } catch (error) {
    // The repository is there, the skill is not: say which skill was looked for.
    if (isAppError(error, "NOT_FOUND")) {
      throw notFound(
        `No skill called "${locator}" in ${repositoryLabel(target.url)}. Paste the link to its folder instead.`,
      );
    }
    throw error;
  }
}

function snapshotOf(dir: string, dirName: string): InstalledSnapshot {
  const files = fileDigests(dir);
  for (const [path, content] of libraryCopyOverrides(dir, dirName) ?? []) {
    files[path] = sha256Hex(content);
  }
  return { hash: hashAsLibraryCopy(dir, dirName) ?? "", files };
}

function documentText(dir: string, overrides?: ReadonlyMap<string, string>): string {
  const document = readSkillDocument(dir);
  if (!document) return "";
  return overrides?.get(document.filename.replaceAll("\\", "/")) ?? document.content;
}

/** Check out what `lead` points at and compare it with the library copy. */
export async function compareLead(
  git: GitClient,
  skill: LibrarySide,
  lead: SourceLead,
): Promise<ComparedLead> {
  const aimed = await targetOf(git, lead, skill.name);
  const { target, revision } = await revisionOf(git, aimed, lead);
  const source = await open(git, target, revision, target.locator ?? skill.name);
  try {
    const libraryHash = hashDir(skill.libraryPath);
    const overrides = libraryCopyOverrides(source.dir, skill.dirName);
    const identical =
      hashAsLibraryCopy(source.dir, skill.dirName) === libraryHash ||
      hashAsLibraryCopy(source.dir, skill.dirName, EOL_INSENSITIVE) ===
        hashDir(skill.libraryPath, EOL_INSENSITIVE);
    const changedFiles = identical
      ? []
      : diffTrees(skill.libraryPath, source.dir, overrides).map((entry) => entry.path);
    const similarity = identical
      ? 1
      : textSimilarity(documentText(skill.libraryPath), documentText(source.dir, overrides));
    const match: SourceMatchKind = identical
      ? "identical"
      : similarity >= SOURCE_SIMILAR_RATIO
        ? "similar"
        : "different";
    const url = redactUrl(target.url);
    return {
      candidate: {
        url,
        label: repositoryLabel(url),
        branch: target.branch,
        subpath: source.subpath,
        marketRef: lead.marketRef ?? null,
        evidence: lead.evidence,
        revision: source.revision,
        match,
        similarity,
        changedFiles,
      },
      libraryHash,
      upstream: snapshotOf(source.dir, skill.dirName),
    };
  } finally {
    await source.cleanup();
  }
}
