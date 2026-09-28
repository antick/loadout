import { existsSync } from "node:fs";
import type { CoreApi, SettingsApi } from "@loadout/shared";
import { type FolderMove, followMovedAgentFolders } from "./agents/follow-folders";
import { AgentRegistry } from "./agents/registry";
import { createAgentsService } from "./agents";
import { createBackupService } from "./backup";
import type { CoreContext } from "./context";
import { type CoreOptions, createContext } from "./create-context";
import { createDeployService, createStaleCopyRefresher, pruneBrokenLinks } from "./deploy";
import { createEditorService, createFileHistory } from "./editor";
import { createSafetyService } from "./safety";
import { createInstallService } from "./install";
import { createInstructionFinder, createInstructionsService } from "./instructions";
import { createMarketService } from "./market";
import { createPresetsService } from "./presets";
import { createProjectsService } from "./projects";
import { createSkillsService } from "./skills/service";
import type { SkillStore } from "./skills/store";
import { type StorageService, createRemovedStore, createStorageService } from "./storage";
import { createSkillsFileService } from "./skills-file/service";
import { createSystemService } from "./system";
import { createSourceNewsStore } from "./sources";
import { createUpdatesService } from "./updates";
import { createWorkspaceService } from "./workspace";

export interface CoreCreateOptions extends CoreOptions {
  /** Proxy-aware fetch supplied by the host. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /**
   * Tests only: the safety scanner program to use (null: none), instead of looking for one on
   * this machine, so results never depend on what the developer has installed.
   */
  safetyScannerPath?: string | null;
}

/** Long-running work the host starts once and stops on quit. */
export interface CoreBackground {
  start(): void;
  stop(): void;
  /** Files changed outside the app (by hand, an agent, or the CLI). */
  libraryChangedOnDisk(): void;
  /** Last chance to save: a local backup commit, no network. */
  beforeQuit(): Promise<void>;
}

export interface Core {
  api: CoreApi;
  ctx: CoreContext;
  store: SkillStore;
  registry: AgentRegistry;
  /** For the host: removing all data needs the deploy clean-up before it quits. */
  storage: StorageService;
  background: CoreBackground;
  /** Folders worth watching for outside changes. */
  watchPaths(): string[];
  /** Workspace skills folders: a change there only touches project pages. */
  projectWatchPaths(): string[];
  /**
   * Move deployments to where agents' folders are now, after a home variable changed. For the
   * desktop app only; see `followMovedAgentFolders`.
   */
  followAgentFolders(): Promise<FolderMove[]>;
  /** The database and the skills folder are still where they were. */
  libraryPresent(): boolean;
  close(): void;
  /** Close without writing anything: the library was deleted and must not come back. */
  abandon(): void;
}

/** Open the library and wire every service. The only place services are constructed. */
export function createCore(options: CoreCreateOptions = {}): Core {
  const bundle = createContext(options);
  const { ctx, store, portable } = bundle;

  // Pick up anything that changed while the app was closed (manual edits, CLI use, a restore).
  portable.rebuild({ authoritative: false });

  const registry = new AgentRegistry(ctx);
  // Writing the metadata and pruning links left by deleted skills change the library: only
  // when nobody else is working in it (an app mid-restore must not see links vanish). When it
  // is busy this waits for the next start.
  const tidied = ctx.lock.holdSync("tidy the library on start", () => {
    portable.write();
    pruneBrokenLinks(ctx, { registry, store });
  });
  if (!tidied) ctx.log.info("The library is busy; start-up tidying waits for the next start");
  const removed = createRemovedStore(ctx, { store });
  const deploy = createDeployService(ctx, { store, registry, removed });
  const staleCopies = createStaleCopyRefresher(ctx, deploy);
  const agents = createAgentsService(ctx, { registry, deploy });
  const history = createFileHistory(ctx.paths.historyDir);
  const safety = createSafetyService(ctx, {
    store,
    findProgram:
      options.safetyScannerPath === undefined
        ? undefined
        : () =>
            options.safetyScannerPath ? { path: options.safetyScannerPath, version: null } : null,
  });
  const sourceNews = createSourceNewsStore(ctx);
  const install = createInstallService(ctx, {
    store,
    registry,
    fetchImpl: options.fetchImpl,
    safety,
    replace: { removed, refreshCopies: deploy.refreshCopies },
    sourceNews,
  });
  const skills = createSkillsService(ctx, {
    store,
    removeDeployments: deploy.removeAllForSkill,
    history,
    install: install.installIntoLibrary,
    // Projects are wired further down; they are only asked for once a rename runs.
    rename: { deploy, projectSkillFolders: () => projects.skillFolders() },
    removed,
  });
  const market = createMarketService(ctx, { store, fetchImpl: options.fetchImpl });
  const updates = createUpdatesService(ctx, {
    store,
    install,
    deploy,
    safety,
    removed,
    sourceNews,
  });
  const presets = createPresetsService(ctx, { store, registry, deploy });
  const workspace = createWorkspaceService(ctx, { store, registry, deploy, install, removed });
  const projects = createProjectsService(ctx, { store, registry, deploy, install, removed });
  const finder = createInstructionFinder({ registry, projects: projects.projects });
  const instructions = createInstructionsService(ctx, { finder });
  const editor = createEditorService(ctx, {
    store,
    registry,
    projects: projects.projects,
    instructions: finder,
    history,
    refreshCopies: async (skill) => {
      const report = await deploy.refreshCopies(skill, { keepModified: true });
      for (const conflict of report.conflicts) {
        ctx.log.warn(`Deployed copy not refreshed: ${conflict.path} ${conflict.reason}`);
      }
      for (const failure of report.failed) {
        ctx.log.warn(`Deployed copy of ${failure.name} not refreshed: ${failure.message}`);
      }
      return { written: report.written, kept: report.kept };
    },
  });
  const backup = createBackupService(ctx, {
    store,
    portable,
    removed,
    fetchImpl: options.fetchImpl,
    afterContentChange: async () => {
      for (const skill of store.list()) await deploy.refreshCopies(skill);
    },
  });
  const system = createSystemService(ctx, { store, install, deploy, registry });
  const storage = createStorageService(ctx, { deploy, store, git: install.git, removed });
  const skillsFile = createSkillsFileService(ctx, { git: install.git, registry, store, removed });

  const settings: SettingsApi = {
    all: async () => ctx.settings.all(),
    get: async (key) => ctx.settings.get(key),
    set: async (key, value) => {
      ctx.settings.set(key, value);
      ctx.touched("settings");
    },
  };

  const api: CoreApi = {
    agents: agents.api,
    skills: skills.api,
    editor: editor.api,
    instructions: instructions.api,
    deploy: deploy.api,
    install: install.api,
    market: market.api,
    safety: safety.api,
    updates: updates.api,
    presets: presets.api,
    workspace: workspace.api,
    projects: projects.api,
    backup: backup.api,
    settings,
    system: system.api,
    storage: storage.api,
    skillsFile: skillsFile.api,
  };

  const background: CoreBackground = {
    start: () => {
      // Library edits made while the app was closed left the copies behind.
      staleCopies.request();
      updates.auto.start();
      backup.auto.start();
      void system
        .publishCli()
        .catch((error: unknown) => ctx.log.warn("Could not publish the CLI", error));
    },
    stop: () => {
      updates.auto.stop();
      backup.auto.stop();
    },
    libraryChangedOnDisk: () => {
      try {
        portable.rebuild({ authoritative: false });
        // Mid-restore or mid-merge a skill folder can be missing for a moment: prune only when
        // nothing is working in the library. The next change looks again.
        ctx.lock.holdSync("prune links after an outside change", () =>
          pruneBrokenLinks(ctx, { registry, store }),
        );
      } catch (error) {
        ctx.log.warn("Could not re-index the library after an outside change", error);
      }
      staleCopies.request();
      backup.auto.notifyChanged();
    },
    beforeQuit: async () => {
      updates.auto.stop();
      backup.auto.stop();
      bundle.flush();
      await backup.auto.runOnQuit();
    },
  };

  // Any change to the library restarts the quiet period before the next automatic backup.
  const touched = ctx.touched;
  ctx.touched = (...scope) => {
    touched(...scope);
    if (scope.includes("skills") || scope.includes("presets")) backup.auto.notifyChanged();
  };

  return {
    api,
    ctx,
    store,
    registry,
    storage,
    background,
    watchPaths: () => [
      ctx.paths.skillsDir,
      ...new Set(registry.list().flatMap((agent) => (agent.installed ? [agent.skillsDir] : []))),
    ],
    projectWatchPaths: () => projects.skillFolders(),
    followAgentFolders: () => followMovedAgentFolders(ctx, { registry, store, deploy }),
    libraryPresent: () => existsSync(ctx.paths.dbPath) && existsSync(ctx.paths.skillsDir),
    close: () => {
      background.stop();
      install.dispose();
      bundle.close();
    },
    abandon: () => {
      background.stop();
      install.dispose();
      bundle.abandon();
    },
  };
}
