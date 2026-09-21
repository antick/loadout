import { randomUUID } from "node:crypto";
import { relative } from "node:path";
import type {
  GitPreview,
  InstallPhase,
  InstallProgress,
  InstallSelection,
  Skill,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { cancelled, invalid } from "../errors";
import type { SkillStore } from "../skills/store";
import { toPosix } from "../util/fs";
import type { CancelRegistry } from "./cancel";
import type { Checkout, GitClient } from "./git-client";
import {
  type GitSource,
  marketSourceToUrl,
  normalizeRepoUrl,
  parseGitSource,
  resolveTreeRef,
} from "./git-source";
import type { InstallIntoLibrary } from "./library";
import { listRepoSkills, resolveSkillDir } from "./repo-scan";

export interface GitInstallerDeps {
  store: SkillStore;
  git: GitClient;
  cancels: CancelRegistry;
  install: InstallIntoLibrary;
  /** Tests only: let a local folder stand in for a remote repository. */
  allowLocalGitSources?: boolean;
  /** How long an unconfirmed preview keeps its checkout (tests shorten it). */
  previewTtlMs?: number;
}

export interface GitInstaller {
  previewGit(repoUrl: string): Promise<GitPreview>;
  confirmGit(previewId: string, items: InstallSelection[]): Promise<Skill[]>;
  cancelPreview(previewId: string): Promise<void>;
  fromMarket(source: string, skillId: string): Promise<Skill>;
  /** Delete every checkout still waiting for a confirm. Call on shutdown. */
  dispose(): Promise<void>;
}

/** A clone the user is still choosing skills from. */
interface PreviewSession {
  /** Progress key: the text exactly as the caller passed it, so its listener matches. */
  key: string;
  typedUrl: string;
  source: GitSource;
  checkout: Checkout;
  /** Preview key → folder. Confirm only ever installs folders the preview itself listed. */
  dirs: Map<string, string>;
  createdAt: number;
}

const PREVIEW_TTL_MS = 30 * 60_000;
const SESSION_EXPIRED = "Clone session expired, please try again";
const RECEIVING_PERCENT = /Receiving objects:\s+(\d+)%/;
const PERCENT_TOTAL = 100;

/** Folder of a skill relative to the repository root; null when the skill is the root. */
function subpathOf(checkout: Checkout, dir: string): string | null {
  return toPosix(relative(checkout.dir, dir)) || null;
}

export function createGitInstaller(ctx: CoreContext, deps: GitInstallerDeps): GitInstaller {
  const { store, git, cancels, install } = deps;
  const ttl = deps.previewTtlMs ?? PREVIEW_TTL_MS;
  const sessions = new Map<string, PreviewSession>();

  function progress(key: string, phase: InstallPhase, extra: Partial<InstallProgress> = {}): void {
    ctx.emit("install:progress", { key, phase, ...extra });
  }

  /** Forward git's download percentage, once per whole percent. */
  function cloneProgress(key: string): (line: string) => void {
    let last = -1;
    return (line) => {
      const percent = Number(RECEIVING_PERCENT.exec(line)?.[1] ?? Number.NaN);
      if (Number.isNaN(percent) || percent === last) return;
      last = percent;
      progress(key, "cloning", { current: percent, total: PERCENT_TOTAL });
    };
  }

  /** Previews nobody confirmed or cancelled would otherwise keep their temp folder forever. */
  async function sweepExpired(): Promise<void> {
    const cutoff = Date.now() - ttl;
    for (const [id, session] of sessions) {
      if (session.createdAt > cutoff) continue;
      sessions.delete(id);
      await session.checkout.cleanup();
    }
  }

  /** Settle the branch / subpath split of a tree URL against the refs the remote really has. */
  async function resolveSource(source: GitSource, signal: AbortSignal): Promise<GitSource> {
    if (!source.treeTail) return source;
    const split = await resolveTreeRef(source.cloneUrl, source.treeTail, (url) =>
      git.listRefs(url, { signal }),
    );
    return { ...source, ...split, treeTail: null };
  }

  return {
    previewGit: async (repoUrl) => {
      // Validate before anything else, so a bad URL never reaches git.
      const parsed = parseGitSource(repoUrl, { allowLocalPath: deps.allowLocalGitSources });
      await sweepExpired();
      const handle = cancels.register(repoUrl);
      let checkout: Checkout | null = null;
      try {
        progress(repoUrl, "cloning");
        const source = await resolveSource(parsed, handle.signal);
        checkout = await git.checkout(source.cloneUrl, {
          branch: source.branch,
          subpath: source.subpath,
          signal: handle.signal,
          onProgress: cloneProgress(repoUrl),
        });
        progress(repoUrl, "scanning");
        const scanRoot = resolveSkillDir(checkout.dir, source.subpath);
        const found = listRepoSkills(scanRoot, { libraryDir: ctx.paths.skillsDir });
        if (handle.signal.aborted) throw cancelled();

        const repoIdentity = normalizeRepoUrl(source.cloneUrl);
        const previewId = randomUUID();
        sessions.set(previewId, {
          key: repoUrl,
          typedUrl: repoUrl.trim(),
          source,
          checkout,
          dirs: new Map(found.map((skill) => [skill.relPath, skill.dir])),
          createdAt: Date.now(),
        });
        return {
          previewId,
          repoUrl: source.cloneUrl,
          branch: source.branch,
          revision: checkout.revision,
          skills: found.map((skill) => ({
            relPath: skill.relPath,
            name: skill.name,
            description: skill.description,
            alreadyInstalled: store
              .findByName(skill.name)
              .some((s) => s.sourceUrl !== null && normalizeRepoUrl(s.sourceUrl) === repoIdentity),
          })),
        };
      } catch (error) {
        await checkout?.cleanup();
        throw error;
      } finally {
        handle.done();
      }
    },

    confirmGit: async (previewId, items) => {
      await sweepExpired();
      const session = sessions.get(previewId);
      if (!session) throw invalid(SESSION_EXPIRED);
      // Taken out first: a second confirm must not race this one for the same folder.
      sessions.delete(previewId);
      const { checkout, source, typedUrl, key } = session;
      try {
        const installed: Skill[] = [];
        for (const [index, item] of items.entries()) {
          const dir = session.dirs.get(item.relPath);
          if (!dir) throw invalid(`'${item.relPath}' is not one of the skills in this preview`);
          progress(key, "installing", {
            current: index + 1,
            total: items.length,
            name: item.name.trim() || item.relPath,
          });
          installed.push(
            await install({
              sourceDir: dir,
              name: item.name,
              record: {
                sourceType: "git",
                sourceRef: typedUrl,
                sourceUrl: source.cloneUrl,
                sourceSubpath: subpathOf(checkout, dir),
                sourceBranch: source.branch,
                sourceRevision: checkout.revision,
                updateStatus: "up_to_date",
              },
            }),
          );
        }
        progress(key, "done");
        return installed;
      } finally {
        await checkout.cleanup();
      }
    },

    cancelPreview: async (previewId) => {
      const session = sessions.get(previewId);
      sessions.delete(previewId);
      await session?.checkout.cleanup();
      await sweepExpired();
    },

    fromMarket: async (source, skillId) => {
      const cloneUrl = marketSourceToUrl(source);
      const id = skillId.trim();
      if (!id || id === "." || id === ".." || /[\\/]/.test(id)) {
        throw invalid(`Invalid marketplace skill id: '${skillId}'`);
      }
      const key = `${source.trim()}/${id}`;
      const handle = cancels.register(key);
      let checkout: Checkout | null = null;
      try {
        progress(key, "cloning");
        checkout = await git.checkout(cloneUrl, {
          signal: handle.signal,
          onProgress: cloneProgress(key),
        });
        progress(key, "installing", { name: id });
        const dir = resolveSkillDir(checkout.dir, undefined, id);
        if (handle.signal.aborted) throw cancelled();
        const skill = await install({
          sourceDir: dir,
          name: id,
          record: {
            sourceType: "marketplace",
            sourceRef: key,
            sourceUrl: cloneUrl,
            sourceSubpath: subpathOf(checkout, dir),
            sourceBranch: null,
            sourceRevision: checkout.revision,
            updateStatus: "up_to_date",
            // Installing what is already installed refreshes it instead of adding `<id>-2`.
            replaceSkillId: store.findBySource("marketplace", key)?.id ?? null,
          },
        });
        progress(key, "done", { name: skill.name });
        return skill;
      } finally {
        await checkout?.cleanup();
        handle.done();
      }
    },

    dispose: async () => {
      const open = [...sessions.values()];
      sessions.clear();
      for (const session of open) await session.checkout.cleanup();
    },
  };
}
