import { join } from "node:path";
import type { BatchImportResult, InstallApi, Skill } from "@skillboard/shared";
import type { AgentRegistry } from "../agents/registry";
import type { CoreContext } from "../context";
import { errorMessage, invalid, notFound } from "../errors";
import { createScanService } from "../scan/service";
import { readSkillIdentity } from "../skills/metadata";
import type { SkillStore } from "../skills/store";
import {
  isDirectory,
  isSkillDir,
  normalizeAbsolutePath,
  readDirSafe,
  statOrNull,
} from "../util/fs";
import { extractArchive } from "./archive";
import { CancelRegistry } from "./cancel";
import { type GitClient, type GitClientOptions, createGitClient } from "./git-client";
import { createGitInstaller } from "./git-install";
import { type InstallIntoLibrary, type InstallRecord, installIntoLibrary } from "./library";

export interface InstallServiceDeps {
  store: SkillStore;
  registry: AgentRegistry;
  /** Tests only: let a local folder stand in for a remote repository. Never set from user input. */
  allowLocalGitSources?: boolean;
  previewTtlMs?: number;
  git?: GitClientOptions;
}

export interface InstallService {
  api: InstallApi;
  /** Shared by the updates service, which clones and checks the same repositories. */
  git: GitClient;
  /** Shared so an update can be cancelled through `install.cancel("update:<skillId>")`. */
  cancels: CancelRegistry;
  /** The single way into the library, bound to this context. */
  installIntoLibrary: InstallIntoLibrary;
  /** Delete temp checkouts of previews nobody confirmed. Call on shutdown. */
  dispose(): Promise<void>;
}

const LOCAL_RECORD = { sourceType: "local", updateStatus: "local_only" } as const;

export function createInstallService(ctx: CoreContext, deps: InstallServiceDeps): InstallService {
  const { store, registry } = deps;
  const git = createGitClient(ctx, deps.git);
  const cancels = new CancelRegistry();
  const install: InstallIntoLibrary = (request) => installIntoLibrary(ctx, store, request);
  const gitInstaller = createGitInstaller(ctx, {
    store,
    git,
    cancels,
    install,
    allowLocalGitSources: deps.allowLocalGitSources,
    previewTtlMs: deps.previewTtlMs,
  });
  const scan = createScanService(ctx, { store, registry, install });

  async function fromPath(sourcePath: string, name?: string): Promise<Skill> {
    const path = normalizeAbsolutePath(sourcePath, "Source path");
    const stat = statOrNull(path);
    if (!stat) throw notFound(`Nothing found at ${path}`);
    const record: InstallRecord = { ...LOCAL_RECORD, sourceRef: path };
    if (stat.isDirectory()) {
      if (!isSkillDir(path)) throw invalid(`No SKILL.md found in ${path}`);
      return install({ sourceDir: path, name, record });
    }
    const archive = await extractArchive(path);
    try {
      return await install({ sourceDir: archive.skillDir, name, record });
    } finally {
      await archive.cleanup();
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
        await install({ sourceDir: child, record: { ...LOCAL_RECORD, sourceRef: child } });
        result.imported += 1;
      } catch (error) {
        result.errors.push({ name, message: errorMessage(error) });
      }
    }
    ctx.emit("install:progress", { key: folderPath, phase: "done" });
    return result;
  }

  const api: InstallApi = {
    fromPath,
    importFolder,
    previewGit: gitInstaller.previewGit,
    confirmGit: gitInstaller.confirmGit,
    cancelPreview: gitInstaller.cancelPreview,
    fromMarket: gitInstaller.fromMarket,
    cancel: async (key) => cancels.cancel(key),
    scanLocal: scan.scanLocal,
    importDiscovered: scan.importDiscovered,
    importAllDiscovered: scan.importAllDiscovered,
  };

  return { api, git, cancels, installIntoLibrary: install, dispose: gitInstaller.dispose };
}
