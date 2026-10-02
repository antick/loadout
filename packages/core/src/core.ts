import { existsSync } from "node:fs";
import type { CoreApi, SettingsApi } from "@loadout/shared";
import { type FolderMove, followMovedAgentFolders } from "./agents/follow-folders";
import { AgentRegistry } from "./agents/registry";
import { createAgentsService } from "./agents";
import { createBackupService } from "./backup";
import type { CoreContext } from "./context";
import { type CoreOptions, createContext } from "./create-context";
import {
  createDeployRepair,
  createDeployService,
  createStaleCopyRefresher,
  pruneBrokenLinks,
} from "./deploy";
import { createEditorService, createFileHistory } from "./editor";
import { createSafetyService } from "./safety";
import { createInstallService } from "./install";
import { createInstructionFinder, createInstructionsService } from "./instructions";
import { createMarketService } from "./market";
import { createPresetSharing, createPresetsService } from "./presets";
import { createProjectsService } from "./projects";
import { createSkillsService } from "./skills/service";
import type { SkillStore } from "./skills/store";
import { type StorageService, createRemovedStore, createStorageService } from "./storage";
import { createSkillsFileService } from "./skills-file/service";
import { createSystemService } from "./system";
import { createSourceNewsStore } from "./sources";
import { createUpdatesService } from "./updates";
import { createWorkspaceService } from "./workspace";
import { createItemsService } from "./items";
import { createDuplicatesService } from "./duplicates";
import { createListingService } from "./listing";
import { createUsageService } from "./usage";
import { createPublishService } from "./publish";

export interface CoreCreateOptions extends CoreOptions {
  /** Proxy-aware fetch supplied by the host. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  /**
   * Tests only: the safety scanner program to use (null: none), instead of looking for one on
   * this machine, so results never depend on what the developer has installed.
   */
  safetyScannerPath?: string | null;
  /**
   * Run Loadout's own safety rules when SkillSpector is not found. On in the app; off in tests
   * that name no scanner (`safetyScannerPath: null`) unless they ask for it.
   */
  builtinSafety?: boolean;
}

/** Long-running work the host starts once and stops on quit. */
export interface CoreBackground {
  start(): void;
  stop(): void;
  /**
   * Files changed outside the app (by hand, an agent, or the CLI). Settles once the library is
   * re-indexed, which waits for any operation working in it; it never rejects.
   */
  libraryChangedOnDisk(): Promise<void>;
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

  const registry = new AgentRegistry(ctx);
  // Pick up anything that changed while the app was closed (manual edits, CLI use, a restore),
  // write the metadata and prune links left by deleted skills: only when nobody else is working
  // in the library. Mid-merge a skill folder is set aside for a moment, and its row would go
  // with its deployments. When it is busy, the process working in it keeps the index.
  const tidied = ctx.lock.holdSync("tidy the library on start", () => {
    portable.rebuild({ authoritative: false });
    portable.write();
    pruneBrokenLinks(ctx, { registry, store });
  });
  if (!tidied) ctx.log.info("The library is busy; start-up tidying waits for the next start");
  const removed = createRemovedStore(ctx, { store });
  const deploy = createDeployService(ctx, { store, registry, removed });
  const staleCopies = createStaleCopyRefresher(ctx, deploy);
  const repair = createDeployRepair(ctx, { store, registry, deploy });
  const agents = createAgentsService(ctx, { registry, deploy });
  const history = createFileHistory(ctx.paths.historyDir);
  const safety = createSafetyService(ctx, {
    store,
    builtin: options.builtinSafety ?? options.safetyScannerPath === undefined,
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
    // Updates are wired further down; an import only happens once everything is built.
    onImported: (skill, sourcePath) =>
      ctx.lock.outside(() => void updates.origin.linkIfExact(skill.id, sourcePath)),
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
  const market = createMarketService(ctx, {
    store,
    fetchImpl: options.fetchImpl,
    clawhub: install.clawhub,
  });
  const updates = createUpdatesService(ctx, {
    store,
    install,
    deploy,
    safety,
    removed,
    sourceNews,
    searchMarket: market.api.search,
  });
  const presets = createPresetsService(ctx, { store, registry, deploy });
  const presetSharing = createPresetSharing(ctx, {
    store,
    presets: presets.presets,
    api: presets.api,
    registry,
    install: install.api,
    installIntoLibrary: install.installIntoLibrary,
    download: install.download,
    safety,
  });
  const workspace = createWorkspaceService(ctx, { store, registry, deploy, install, removed });
  const projects = createProjectsService(ctx, { store, registry, deploy, install, removed });
  const items = createItemsService(ctx, {
    registry,
    projects: projects.projects,
    git: install.git,
  });
  /** Items changed by a sync or by hand: their deployed files follow, unless edited there. */
  const refreshItems = (): void => {
    try {
      let written = 0;
      // Writes agent folders and records: only while nothing else works in the library.
      ctx.lock.holdSync("refresh deployed items", () => {
        written = items.refreshAll();
      });
      if (written > 0) ctx.touched("items");
    } catch (error) {
      ctx.log.warn("Could not refresh deployed subagents, commands and rules", error);
    }
  };
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
      // Only copies now behind the library; one edited in the agent's folder is left alone.
      await deploy.refreshStaleCopies();
      refreshItems();
    },
  });
  const system = createSystemService(ctx, { store, install, deploy, registry, repair });

  const skillsFile = createSkillsFileService(ctx, {
    git: install.git,
    registry,
    store,
    removed,
    safety,
  });
  const usage = createUsageService(ctx, { store });
  const duplicates = createDuplicatesService(ctx, {
    store,
    api: { skills: skills.api, presets: { ...presets.api, ...presetSharing }, deploy: deploy.api },
  });

  const publish = createPublishService(ctx, { store, clawhub: install.clawhub });
  const storage = createStorageService(ctx, { deploy, store, git: install.git, removed, publish });
  const listing = createListingService(ctx, { registry, workspace: workspace.api });

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
    presets: { ...presets.api, ...presetSharing },
    workspace: workspace.api,
    projects: projects.api,
    backup: backup.api,
    settings,
    system: system.api,
    storage: storage.api,
    skillsFile: skillsFile.api,
    items: items.api,
    usage: usage.api,
    duplicates: duplicates.api,
    publish: publish.api,
    listing: listing.api,
  };

  /** An outside change waiting for its turn at the lock: later changes ride along with it. */
  let waiting: { done: Promise<void> } | null = null;
  const background: CoreBackground = {
    start: () => {
      // Library edits made while the app was closed left the copies behind.
      staleCopies.request();
      // Skills that arrived without a check (an older version, the CLI) get one from the rules.
      void safety
        .scanDueQuietly()
        .catch((error: unknown) => ctx.log.warn("Could not check the library", error));
      // Deployments that went missing while the app was closed come back; what cannot is reported.
      void repair
        .run()
        .catch((error: unknown) => ctx.log.warn("Could not repair deployments", error));
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
      if (waiting) return waiting.done;
      const turn = { done: Promise.resolve() };
      waiting = turn;
      // Mid-restore or mid-merge a skill folder can be missing for a moment: re-index and prune
      // once whatever works in the library is done, never in between.
      turn.done = ctx.lock
        .run("re-index after an outside change", () => {
          if (waiting === turn) waiting = null;
          portable.rebuild({ authoritative: false });
          pruneBrokenLinks(ctx, { registry, store });
        })
        .then(() => {
          staleCopies.request();
          refreshItems();
          backup.auto.notifyChanged();
        })
        .catch((error: unknown) => {
          if (waiting === turn) waiting = null;
          ctx.log.warn("Could not re-index the library after an outside change", error);
        });
      return turn.done;
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
    if (scope.includes("skills") || scope.includes("presets") || scope.includes("items")) {
      backup.auto.notifyChanged();
    }
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
