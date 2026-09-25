import { relative } from "node:path";
import type { GitPreview, InstallSelection, RepoSkillPreview, Skill } from "@loadout/shared";
import type { CoreContext } from "../context";
import { cancelled, invalid } from "../errors";
import type { SkillStore } from "../skills/store";
import { toPosix } from "../util/fs";
import { listArchiveSkills, unpackArchive, unpackArchiveFile } from "./archive";
import { archiveLink, archiveLinkName } from "./archive-link";
import type { CancelRegistry } from "./cancel";
import { type Download, percentReporter } from "./download";
import type { GitClient } from "./git-client";
import {
  type GitSource,
  marketSourceToUrl,
  normalizeRepoUrl,
  parseGitSource,
  resolveTreeRef,
} from "./git-source";
import type { InstallIntoLibrary, InstallRecord } from "./library";
import { createPreviewSessions, emitProgress } from "./preview-sessions";
import { type FoundSkill, listRepoSkills, resolveSkillDir } from "./repo-scan";

export interface GitInstallerDeps {
  store: SkillStore;
  git: GitClient;
  download: Download;
  cancels: CancelRegistry;
  install: InstallIntoLibrary;
  /** Tests only: let a local folder stand in for a remote repository. */
  allowLocalGitSources?: boolean;
  /** How long an unconfirmed preview keeps its checkout (tests shorten it). */
  previewTtlMs?: number;
}

export interface GitInstaller {
  /** A Git repository, or a link to an archive. */
  previewGit(input: string): Promise<GitPreview>;
  /** An archive file on this computer (`.zip`, `.skill`, `.tar`, `.tar.gz`, `.tgz`). */
  previewArchive(archivePath: string): Promise<GitPreview>;
  confirmGit(previewId: string, items: InstallSelection[]): Promise<Skill[]>;
  cancelPreview(previewId: string): Promise<void>;
  fromMarket(source: string, skillId: string): Promise<Skill>;
  /** Delete every checkout still waiting for a confirm. Call on shutdown. */
  dispose(): Promise<void>;
}

const PERCENT_TOTAL = 100;

/** Folder of a skill relative to `root`; null when the skill is the root itself. */
function subpathOf(root: string, dir: string): string | null {
  return toPosix(relative(root, dir)) || null;
}

export function createGitInstaller(ctx: CoreContext, deps: GitInstallerDeps): GitInstaller {
  const { store, git, download, cancels, install } = deps;
  const sessions = createPreviewSessions(ctx, install, deps.previewTtlMs);

  /** Forward the download percentage of a checkout or an archive. */
  function percentProgress(
    key: string,
    phase: "cloning" | "downloading" = "cloning",
  ): (percent: number) => void {
    return (percent) => emitProgress(ctx, key, phase, { current: percent, total: PERCENT_TOTAL });
  }

  /** Settle the branch / subpath split of a tree URL against the refs the remote really has. */
  async function resolveSource(source: GitSource, signal: AbortSignal): Promise<GitSource> {
    if (!source.treeTail) return source;
    const split = await resolveTreeRef(source.cloneUrl, source.treeTail, (url) =>
      git.listRefs(url, { signal }),
    );
    return { ...source, ...split, treeTail: null };
  }

  function previewSkills(
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

  async function previewRepository(repoUrl: string): Promise<GitPreview> {
    // Validate before anything else, so a bad URL never reaches git.
    const parsed = parseGitSource(repoUrl, { allowLocalPath: deps.allowLocalGitSources });
    const handle = cancels.register(repoUrl);
    let cleanup: (() => Promise<void>) | null = null;
    try {
      emitProgress(ctx, repoUrl, "cloning");
      const source = await resolveSource(parsed, handle.signal);
      const checkout = await git.checkout(source.cloneUrl, {
        branch: source.branch,
        subpath: source.subpath,
        signal: handle.signal,
        onPercent: percentProgress(repoUrl),
      });
      cleanup = checkout.cleanup;
      emitProgress(ctx, repoUrl, "scanning");
      const scanRoot = resolveSkillDir(checkout.dir, source.subpath);
      const found = listRepoSkills(scanRoot, { libraryDir: ctx.paths.skillsDir });
      if (handle.signal.aborted) throw cancelled();

      const repoIdentity = normalizeRepoUrl(source.cloneUrl);
      const typedUrl = repoUrl.trim();
      const previewId = await sessions.open({
        key: repoUrl,
        dirs: new Map(found.map((skill) => [skill.relPath, skill.dir])),
        record: (dir) => ({
          sourceType: "git",
          sourceRef: typedUrl,
          sourceUrl: source.cloneUrl,
          sourceSubpath: subpathOf(checkout.dir, dir),
          sourceBranch: source.branch,
          sourceRevision: checkout.revision,
          updateStatus: "up_to_date",
        }),
        cleanup: checkout.cleanup,
      });
      cleanup = null;
      return {
        previewId,
        kind: "repository",
        repoUrl: source.cloneUrl,
        branch: source.branch,
        revision: checkout.revision,
        skills: previewSkills(
          found,
          (s) => s.sourceUrl !== null && normalizeRepoUrl(s.sourceUrl) === repoIdentity,
        ),
      };
    } finally {
      await cleanup?.();
      handle.done();
    }
  }

  /**
   * Download (or read) an archive, unpack it and list its skills. `record` gives the source
   * fields of a skill at `subpath` inside the archive (null when the archive root is the skill).
   */
  async function previewUnpacked(
    key: string,
    shownAs: string,
    unpack: (signal: AbortSignal) => Promise<{ root: string; cleanup(): Promise<void> }>,
    record: (subpath: string | null) => InstallRecord,
    installed: (skill: Skill) => boolean,
  ): Promise<GitPreview> {
    const handle = cancels.register(key);
    let cleanup: (() => Promise<void>) | null = null;
    try {
      const archive = await unpack(handle.signal);
      cleanup = archive.cleanup;
      emitProgress(ctx, key, "scanning");
      const found = listArchiveSkills(archive.root);
      if (handle.signal.aborted) throw cancelled();
      const previewId = await sessions.open({
        key,
        dirs: new Map(found.map((skill) => [skill.relPath, skill.dir])),
        record: (dir) => record(subpathOf(archive.root, dir)),
        cleanup: archive.cleanup,
      });
      cleanup = null;
      return {
        previewId,
        kind: "archive",
        repoUrl: shownAs,
        branch: null,
        revision: null,
        skills: previewSkills(found, installed),
      };
    } finally {
      await cleanup?.();
      handle.done();
    }
  }

  async function previewLink(input: string, link: string): Promise<GitPreview> {
    return previewUnpacked(
      input,
      link,
      async (signal) => {
        emitProgress(ctx, input, "downloading");
        const data = await download(link, {
          signal,
          subject: "The archive",
          onProgress: percentReporter(percentProgress(input, "downloading")),
        });
        if (signal.aborted) throw cancelled();
        return unpackArchive(data, archiveLinkName(link));
      },
      (subpath) => ({
        sourceType: "url",
        sourceRef: link,
        sourceUrl: link,
        sourceSubpath: subpath,
        updateStatus: "up_to_date",
      }),
      (s) => s.sourceType === "url" && s.sourceRef === link,
    );
  }

  return {
    previewGit: async (input) => {
      const link = archiveLink(input);
      return link ? previewLink(input, link) : previewRepository(input);
    },

    previewArchive: async (archivePath) => {
      const path = archivePath.trim();
      if (!path) throw invalid("Archive path is required");
      return previewUnpacked(
        archivePath,
        path,
        () => unpackArchiveFile(path),
        (subpath) => ({
          sourceType: "local",
          sourceRef: path,
          sourceSubpath: subpath,
          updateStatus: "local_only",
        }),
        (s) => s.sourceType === "local" && s.sourceRef === path,
      );
    },

    confirmGit: sessions.confirm,
    cancelPreview: sessions.cancel,

    fromMarket: async (source, skillId) => {
      const cloneUrl = marketSourceToUrl(source);
      const id = skillId.trim();
      if (!id || id === "." || id === ".." || /[\\/]/.test(id)) {
        throw invalid(`Invalid marketplace skill id: '${skillId}'`);
      }
      const key = `${source.trim()}/${id}`;
      const handle = cancels.register(key);
      let cleanup: (() => Promise<void>) | null = null;
      try {
        emitProgress(ctx, key, "cloning");
        const checkout = await git.checkout(cloneUrl, {
          signal: handle.signal,
          onPercent: percentProgress(key),
        });
        cleanup = checkout.cleanup;
        emitProgress(ctx, key, "installing", { name: id });
        const dir = resolveSkillDir(checkout.dir, undefined, id);
        if (handle.signal.aborted) throw cancelled();
        const skill = await install({
          sourceDir: dir,
          name: id,
          record: {
            sourceType: "marketplace",
            sourceRef: key,
            sourceUrl: cloneUrl,
            sourceSubpath: subpathOf(checkout.dir, dir),
            sourceBranch: null,
            sourceRevision: checkout.revision,
            updateStatus: "up_to_date",
            // Installing what is already installed refreshes it instead of adding `<id>-2`.
            replaceSkillId: store.findBySource("marketplace", key)?.id ?? null,
          },
        });
        emitProgress(ctx, key, "done", { name: skill.name });
        return skill;
      } finally {
        await cleanup?.();
        handle.done();
      }
    },

    dispose: sessions.dispose,
  };
}
