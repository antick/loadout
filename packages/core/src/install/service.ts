import { join } from "node:path";
import type { BatchImportResult, InstallApi, InstallOptions, Skill } from "@loadout/shared";
import type { AgentRegistry } from "../agents/registry";
import type { CoreContext } from "../context";
import { errorMessage, invalid, notFound } from "../errors";
import type { ScanService } from "../scan/service";
import { readSkillIdentity } from "../skills/metadata";
import type { SkillStore } from "../skills/store";
import {
  isDirectory,
  isSkillDir,
  normalizeAbsolutePath,
  readDirSafe,
  statOrNull,
} from "../util/fs";
import { CancelRegistry } from "./cancel";
import { type Download, type HttpRequest, downloadWith } from "./download";
import { type GitClient, createGitClient } from "./git-client";
import { withHttpFallback } from "./git-fallback";
import { createGitInstaller } from "./git-install";
import { createHttpGit } from "./http-git";
import { type InstallIntoLibrary, installIntoLibrary } from "./library";
import type { SourceNewsStore } from "../sources/news-store";
import type { ReplaceDeps } from "./replace";
import { type SafetyGate, batchFailureMessage, installChecked } from "./safety-gate";
import type { ClawhubClient } from "../market/clawhub";
import { createClawhubInstaller, createClawhubReader } from "./clawhub-install";
import { emitProgress } from "./preview-sessions";
import { readFolderSkill } from "./read-skill";

export interface InstallServiceDeps {
  store: SkillStore;
  registry: AgentRegistry;
  /** HTTP client for downloads (Git-less repositories, archive links), proxy-aware in the app. */
  request: HttpRequest;
  /** The ClawHub registry, on the same HTTP client. */
  clawhub: ClawhubClient;
  /** Safety checks before every install. */
  safety: SafetyGate;
  /** Recently removed and deployed copies, for an import that replaces a library skill. */
  replace: ReplaceDeps;
  /** Which skills of each repository were already offered. */
  sourceNews: Pick<SourceNewsStore, "markSeen">;
}

/** `InstallApi` without the scan of this machine, which `core.ts` adds from the scan service. */
export type InstallApiWithoutScan = Omit<InstallApi, keyof ScanService>;

export interface InstallService {
  api: InstallApiWithoutScan;
  /** Shared by the updates service, which clones and checks the same repositories. */
  git: GitClient;
  /** Shared by the updates service, which downloads archive links again to check them. */
  download: Download;
  /** Shared by the marketplace and the updates service: one ClawHub client for all. */
  clawhub: ClawhubClient;
  /** Shared so an update can be cancelled through `install.cancel("update:<skillId>")`. */
  cancels: CancelRegistry;
  /** The single way into the library, bound to this context. */
  installIntoLibrary: InstallIntoLibrary;
  /** Delete temp checkouts of previews nobody confirmed. Call on shutdown. */
  dispose(): Promise<void>;
}

const LOCAL_RECORD = { sourceType: "local", updateStatus: "local_only" } as const;

/**
 * The skill folder a folder install takes, or why it cannot: the install and its dry run
 * (`skills install <folder> --dry-run`) refuse the same things. Archives go through
 * `previewArchive`, which lists what they hold before installing.
 */
export function requireSkillFolder(sourcePath: string): string {
  const path = normalizeAbsolutePath(sourcePath, "Source path");
  const stat = statOrNull(path);
  if (!stat) throw notFound(`Nothing found at ${path}`);
  if (!stat.isDirectory()) throw invalid(`Not a folder: ${path}`);
  if (!isSkillDir(path)) throw invalid(`No SKILL.md found in ${path}`);
  return path;
}
export function createInstallService(ctx: CoreContext, deps: InstallServiceDeps): InstallService {
  const { store, registry, clawhub } = deps;
  const download = downloadWith(deps.request);
  // System Git when it is installed; public GitHub and GitLab repositories work without it.
  const git = withHttpFallback(createGitClient(ctx), createHttpGit(download));
  const cancels = new CancelRegistry();
  const install: InstallIntoLibrary = (request) => installIntoLibrary(ctx, store, request);
  const gitInstaller = createGitInstaller(ctx, {
    store,
    git,
    download,
    cancels,
    install,
    safety: deps.safety,
    replace: deps.replace,
    sourceNews: deps.sourceNews,
    agentKeys: () => new Set(registry.list().map((agent) => agent.key)),
  });
  const clawhubDeps = {
    store,
    clawhub,
    cancels,
    install,
    safety: deps.safety,
    replace: deps.replace,
  };
  const fromClawhub = createClawhubInstaller(ctx, clawhubDeps);
  const readClawhubSkill = createClawhubReader(ctx, clawhubDeps);

  async function fromPath(
    sourcePath: string,
    name?: string,
    options: InstallOptions = {},
  ): Promise<Skill> {
    const path = requireSkillFolder(sourcePath);
    try {
      return await installChecked(
        install,
        deps.safety,
        { sourceDir: path, name, record: { ...LOCAL_RECORD, sourceRef: path } },
        { ...options, progressKey: sourcePath },
      );
    } finally {
      // The safety check reported under this key; the status bar must stop showing it.
      emitProgress(ctx, sourcePath, "done");
    }
  }

  async function importFolder(folderPath: string): Promise<BatchImportResult> {
    const folder = normalizeAbsolutePath(folderPath, "Folder path");
    if (!isDirectory(folder)) throw notFound(`Folder not found: ${folder}`);
    const children = readDirSafe(folder)
      .map((entry) => join(folder, entry.name))
      .filter(isSkillDir)
      .sort((a, b) => a.localeCompare(b));
    const result: BatchImportResult = { imported: 0, skipped: 0, errors: [] };
    for (const [index, child] of children.entries()) {
      const name = readSkillIdentity(child).name;
      ctx.emit("install:progress", {
        key: folderPath,
        phase: "installing",
        current: index + 1,
        total: children.length,
        name,
      });
      // A skill of that name is already in the library: a bulk import never touches it.
      if (store.findByLibraryPath(join(ctx.paths.skillsDir, name))) {
        result.skipped += 1;
        continue;
      }
      try {
        await installChecked(install, deps.safety, {
          sourceDir: child,
          record: { ...LOCAL_RECORD, sourceRef: child },
        });
        result.imported += 1;
      } catch (error) {
        result.errors.push({ name, message: batchFailureMessage(error, errorMessage(error)) });
      }
    }
    ctx.emit("install:progress", { key: folderPath, phase: "done" });
    return result;
  }

  const api: InstallApiWithoutScan = {
    fromPath,
    importFolder,
    previewGit: gitInstaller.previewGit,
    previewArchive: gitInstaller.previewArchive,
    confirmGit: gitInstaller.confirmGit,
    cancelPreview: gitInstaller.cancelPreview,
    readPreviewSkill: gitInstaller.readPreviewSkill,
    readClawhubSkill,
    readFolderSkill: (folderPath, options) => readFolderSkill(deps.safety, folderPath, options),
    fromMarket: gitInstaller.fromMarket,
    fromClawhub,
    cancel: async (key) => cancels.cancel(key),
  };

  return {
    api,
    git,
    download,
    clawhub,
    cancels,
    installIntoLibrary: install,
    dispose: gitInstaller.dispose,
  };
}
