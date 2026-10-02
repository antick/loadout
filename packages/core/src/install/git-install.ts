import {
  type ConfirmOptions,
  type GitPreview,
  type InstallOptions,
  type InstallSelection,
  NO_REQUESTED_AGENTS,
  type Skill,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { cancelled, invalid } from "../errors";
import type { SkillStore } from "../skills/store";
import { unpackArchiveFile } from "./archive";
import { archiveLink, skillFileLink } from "./archive-link";
import type { CancelRegistry } from "./cancel";
import type { Download } from "./download";
import { createFetchedPreviews, previewLibrary, previewRows, subpathOf } from "./fetched-preview";
import type { GitClient } from "./git-client";
import {
  type GitSource,
  isPlainUrl,
  marketSourceToUrl,
  normalizeRepoUrl,
  parseGitSource,
  resolveTreeRef,
} from "./git-source";
import type { InstallIntoLibrary } from "./library";
import { repositorySourceKey } from "@loadout/shared";
import type { SourceNewsStore } from "../sources/news-store";
import { type ReplaceDeps, installOver } from "./replace";
import { type SafetyGate, installChecked } from "./safety-gate";
import { type PreviewSessions, createPreviewSessions, emitProgress } from "./preview-sessions";
import { listRepoSkills, resolveSkillDir } from "./repo-scan";
import { matchRequested } from "./requested";
import { type SkillsCommand, agentKeyFor, parseSkillsCommand } from "./skills-command";
import { createWebPreviews } from "./web-install";
import { isSiteCandidate } from "./well-known";

export interface GitInstallerDeps {
  store: SkillStore;
  git: GitClient;
  download: Download;
  cancels: CancelRegistry;
  install: InstallIntoLibrary;
  safety?: SafetyGate;
  replace?: ReplaceDeps;
  /** Remembers which skills of a repository an import listed, so they are not news later. */
  sourceNews?: Pick<SourceNewsStore, "markSeen">;
  /** Tests only: let a local folder stand in for a remote repository. */
  allowLocalGitSources?: boolean;
  /** How long an unconfirmed preview keeps its checkout (tests shorten it). */
  previewTtlMs?: number;
  /** Every agent key there is, to read the agents a pasted `skills add` command names. */
  agentKeys(): ReadonlySet<string>;
}

export interface GitInstaller {
  /** A Git repository, a link to an archive or a `SKILL.md`, or a site that publishes skills. */
  previewGit(input: string): Promise<GitPreview>;
  /** An archive file on this computer (`.zip`, `.skill`, `.tar`, `.tar.gz`, `.tgz`). */
  previewArchive(archivePath: string): Promise<GitPreview>;
  confirmGit(
    previewId: string,
    items: InstallSelection[],
    options?: ConfirmOptions,
  ): Promise<Skill[]>;
  cancelPreview(previewId: string): Promise<void>;
  readPreviewSkill: PreviewSessions["read"];
  fromMarket(source: string, skillId: string, options?: InstallOptions): Promise<Skill>;
  /** Delete every checkout still waiting for a confirm. Call on shutdown. */
  dispose(): Promise<void>;
}

const PERCENT_TOTAL = 100;

export function createGitInstaller(ctx: CoreContext, deps: GitInstallerDeps): GitInstaller {
  const { store, git, download, cancels, install } = deps;
  const sessions = createPreviewSessions(
    ctx,
    { install, store, safety: deps.safety, replace: deps.replace },
    deps.previewTtlMs,
  );
  const previewFetched = createFetchedPreviews(ctx, { store, cancels, sessions });
  const web = createWebPreviews(ctx, { download, cancels, previewFetched });

  /** Forward the download percentage of a checkout. */
  function percentProgress(key: string): (percent: number) => void {
    return (percent) =>
      emitProgress(ctx, key, "cloning", { current: percent, total: PERCENT_TOTAL });
  }

  /** Settle the branch / subpath split of a tree URL against the refs the remote really has. */
  async function resolveSource(source: GitSource, signal: AbortSignal): Promise<GitSource> {
    if (!source.treeTail) return source;
    const split = await resolveTreeRef(source.cloneUrl, source.treeTail, (url) =>
      git.listRefs(url, { signal }),
    );
    return { ...source, ...split, treeTail: null };
  }

  /**
   * Clone and list a repository. `key` is the text as the caller sent it (progress and cancel go
   * by it); `repoUrl` the repository part of it; `wanted` skills named outside the URL.
   */
  async function previewRepository(
    key: string,
    repoUrl: string,
    wanted: readonly string[] = [],
  ): Promise<GitPreview> {
    // Validate before anything else, so a bad URL never reaches git.
    const parsed = parseGitSource(repoUrl, { allowLocalPath: deps.allowLocalGitSources });
    const handle = cancels.register(key);
    let cleanup: (() => Promise<void>) | null = null;
    try {
      emitProgress(ctx, key, "cloning");
      const source = await resolveSource(parsed, handle.signal);
      const checkout = await git.checkout(source.cloneUrl, {
        branch: source.branch,
        // The list needs only each skill's SKILL.md; confirming fetches the chosen folders.
        manifestsOnly: true,
        signal: handle.signal,
        onPercent: percentProgress(key),
      });
      cleanup = checkout.cleanup;
      emitProgress(ctx, key, "scanning");
      const scanRoot = resolveSkillDir(checkout.dir, source.subpath);
      const found = listRepoSkills(scanRoot, { libraryDir: ctx.paths.skillsDir });
      if (handle.signal.aborted) throw cancelled();

      const repoIdentity = normalizeRepoUrl(source.cloneUrl);
      const typedUrl = repoUrl.trim();
      const previewId = await sessions.open({
        key,
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
        materialize: checkout.materialize,
        cleanup: checkout.cleanup,
        confirmed: () =>
          deps.sourceNews?.markSeen(
            repositorySourceKey(source.cloneUrl, source.branch),
            found.map((skill) => subpathOf(checkout.dir, skill.dir) ?? ""),
            // Only a list of the whole repository can stand for everything it holds.
            source.subpath ? null : checkout.revision,
          ),
      });
      cleanup = null;
      const fromThisRepo = (s: Skill): boolean =>
        s.sourceUrl !== null && normalizeRepoUrl(s.sourceUrl) === repoIdentity;
      return {
        previewId,
        kind: "repository",
        repoUrl: source.cloneUrl,
        branch: source.branch,
        revision: checkout.revision,
        skills: previewRows(store, found, fromThisRepo),
        ...matchRequested(found, source.skill ? [source.skill, ...wanted] : wanted),
        library: previewLibrary(ctx, store, fromThisRepo),
        redirectedTo: null,
        ...NO_REQUESTED_AGENTS,
      };
    } finally {
      await cleanup?.();
      handle.done();
    }
  }

  /**
   * Understand the typed text and preview what it points at: an archive link, a `SKILL.md` link, a
   * site with a skills index, or else a repository. `wanted` names skills to tick.
   */
  async function previewSource(
    key: string,
    text: string,
    wanted: readonly string[] = [],
  ): Promise<GitPreview> {
    try {
      return await previewAnySource(key, text, wanted);
    } finally {
      // Found, failed or cancelled: the status bar stops showing the download either way.
      emitProgress(ctx, key, "done");
    }
  }

  async function previewAnySource(
    key: string,
    text: string,
    wanted: readonly string[] = [],
  ): Promise<GitPreview> {
    const link = archiveLink(text);
    if (link) return web.archiveLink(key, link, wanted);
    const file = skillFileLink(text);
    if (file) return web.skillFile(key, file);
    // Only an address no repository pattern claimed can be a site; the rest stay Git sources.
    if (isSiteCandidate(text) && isPlainUrl(text)) {
      const index = await web.findSite(key, text);
      if (index) return web.site(key, text, index, wanted);
    }
    return previewRepository(key, text, wanted);
  }

  /** Preview what a pasted `skills add` command installs, with its skills ticked. */
  async function previewCommand(key: string, command: SkillsCommand): Promise<GitPreview> {
    const preview = await previewSource(
      key,
      command.source,
      command.allSkills ? [] : command.skills,
    );
    const known = deps.agentKeys();
    const agents: string[] = [];
    const unknownAgents: string[] = [];
    for (const id of command.agents) {
      const agentKey = agentKeyFor(id, known);
      if (agentKey) {
        if (!agents.includes(agentKey)) agents.push(agentKey);
      } else unknownAgents.push(id);
    }
    return {
      ...preview,
      // `--skill '*'` or `--all` takes everything, whatever the source text named.
      ...(command.allSkills ? { selected: null, missing: [] } : {}),
      agents,
      unknownAgents,
      allAgents: command.allAgents,
    };
  }

  return {
    previewGit: (input) => {
      const command = parseSkillsCommand(input);
      return command ? previewCommand(input, command) : previewSource(input, input.trim());
    },

    previewArchive: async (archivePath) => {
      const path = archivePath.trim();
      if (!path) throw invalid("Archive path is required");
      try {
        return await previewFetched({
          key: archivePath,
          kind: "archive",
          shownAs: path,
          fetch: () => unpackArchiveFile(path),
          record: (subpath) => ({
            sourceType: "local",
            sourceRef: path,
            sourceSubpath: subpath,
            updateStatus: "local_only",
          }),
          installed: (s) => s.sourceType === "local" && s.sourceRef === path,
        });
      } finally {
        // Listed, failed or cancelled: the status bar stops showing the scan either way.
        emitProgress(ctx, archivePath, "done");
      }
    },

    confirmGit: sessions.confirm,
    cancelPreview: sessions.cancel,
    readPreviewSkill: sessions.read,

    fromMarket: async (source, skillId, options = {}) => {
      const cloneUrl = marketSourceToUrl(source);
      const id = skillId.trim();
      if (!id || id === "." || id === ".." || /[\\/]/.test(id)) {
        throw invalid(`Invalid marketplace skill id: '${skillId}'`);
      }
      const key = `${source.trim()}/${id}`;
      const handle = cancels.register(key);
      let cleanup: (() => Promise<void>) | null = null;
      let installedName: string | null = null;
      try {
        emitProgress(ctx, key, "cloning");
        const checkout = await git.checkout(cloneUrl, {
          signal: handle.signal,
          onPercent: percentProgress(key),
          // Found by its SKILL.md; then only that folder is fetched in full.
          manifestsOnly: true,
        });
        cleanup = checkout.cleanup;
        emitProgress(ctx, key, "installing", { name: id });
        const dir = resolveSkillDir(checkout.dir, undefined, id);
        await checkout.materialize([dir]);
        if (handle.signal.aborted) throw cancelled();
        // Installing what is already installed refreshes it instead of adding `<id>-2`.
        const owner = store.findBySource("marketplace", key);
        const skill = await installChecked(
          installOver(ctx, install, deps.replace, owner),
          deps.safety,
          {
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
            },
          },
          { ...options, progressKey: key },
        );
        installedName = skill.name;
        return skill;
      } finally {
        await cleanup?.();
        handle.done();
        emitProgress(ctx, key, "done", installedName ? { name: installedName } : {});
      }
    },

    dispose: sessions.dispose,
  };
}
