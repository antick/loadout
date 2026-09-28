import type {
  ExportResult,
  ActivityEntry,
  AgentControlStatus,
  AgentInfo,
  ApplyOptions,
  ApplyResult,
  BackupConflict,
  BackupStatus,
  BatchResult,
  BatchUpdateResult,
  BrokenSkillFolder,
  CliStatus,
  ConflictResolution,
  CrashInfo,
  CustomAgentInput,
  DeviceFlowPoll,
  DeviceFlowStart,
  DiagnosticInfo,
  GithubAuthMethod,
  GithubConnectResult,
  LibraryLocation,
  LocalSkill,
  LogExcerpt,
  LogExport,
  MergeSummary,
  Preset,
  PresetAgentToggle,
  PresetDeployStatus,
  PresetInput,
  Project,
  ProjectCopyRef,
  ProjectSuggestion,
  ProjectTarget,
  PushToLibraryOptions,
  PushToLibraryResult,
  RenameOptions,
  RemoveSkillsResult,
  RenameResult,
  SizeReport,
  Skill,
  SkillDocument,
  Snapshot,
  SourceDiff,
  SourceDiffOptions,
  SourceDocument,
  SyncOutcome,
  UpdateResult,
} from "./types";
import type {
  EditTarget,
  SaveSkillFileInput,
  SaveSkillFileResult,
  SkillFile,
  SkillFileChangeResult,
  SkillFileEntry,
  SkillFileVersion,
  SkillLocation,
} from "./types-editor";
import type {
  BatchImportResult,
  GitPreview,
  InstallSelection,
  ConfirmOptions,
  MarketBoard,
  MarketListing,
  MarketSkillDetail,
  ScanResult,
} from "./types-install";
import type { CreateSkillInput } from "./new-skill";
import type { InstallOptions, SafetyRecord, SafetyScanSummary, SafetyStatus } from "./safety";
import type { InstructionFile } from "./instructions";
import type { SecretFinding } from "./secrets";
import type { SkillsFileApi } from "./api-skills-file";
import type {
  AgentFolderSummary,
  ClearableArea,
  RemovedFolder,
  RestoreRemovedResult,
  StorageReport,
} from "./storage";
import type { AppApi } from "./api-app";
import type { SettingKey, SettingValue, Settings } from "./settings";

/**
 * The full surface the renderer (and the CLI) can call. Each namespace is implemented by a core
 * service, except `app`, which the Electron main process implements.
 * IPC channel for a method is `<namespace>.<method>`.
 */

export interface AgentsApi {
  list(): Promise<AgentInfo[]>;
  setEnabled(key: string, enabled: boolean): Promise<void>;
  setAllEnabled(enabled: boolean): Promise<void>;
  setOrder(keys: string[]): Promise<void>;
  addCustom(input: CustomAgentInput): Promise<AgentInfo>;
  removeCustom(key: string): Promise<void>;
  setSkillsDir(key: string, path: string): Promise<void>;
  resetSkillsDir(key: string): Promise<void>;
  setProjectSkillsDir(key: string, relativePath: string | null): Promise<void>;
  resetProjectSkillsDir(key: string): Promise<void>;
}

export interface SkillsApi {
  list(): Promise<Skill[]>;
  get(skillId: string): Promise<Skill>;
  /** Write a new skill into the library from a name and description. ALREADY_EXISTS when taken. */
  create(input: CreateSkillInput): Promise<Skill>;
  document(skillId: string): Promise<SkillDocument>;
  remove(skillId: string): Promise<void>;
  removeMany(skillIds: string[]): Promise<RemoveSkillsResult>;
  allTags(): Promise<string[]>;
  setTags(skillId: string, tags: string[]): Promise<void>;
  /**
   * Give a library skill a new name: its folder, the `name` in its SKILL.md, every deployment
   * and the links projects hold to it. Refused before anything changes when the name is taken
   * or badly formed, a folder of that name is in an agent's way, or a copy was edited in an
   * agent's folder.
   */
  rename(skillId: string, name: string, options?: RenameOptions): Promise<RenameResult>;
  renameTag(from: string, to: string): Promise<void>;
  deleteTag(tag: string): Promise<void>;
  /** Open the skill's library folder in the OS file manager. */
  reveal(skillId: string): Promise<void>;
  /**
   * Pack skills into one `.zip` / `.skill` file at `destPath`, one folder per skill, ready to be
   * installed again anywhere. Replaces a file already at that path.
   */
  exportArchive(skillIds: string[], destPath: string): Promise<ExportResult>;
}

/** The in-app editor: any skill folder, in the library, an agent's folder or a project. */
export interface EditorApi {
  target(location: SkillLocation): Promise<EditTarget>;
  /** Every content file of the skill, main document first, then by path. */
  files(location: SkillLocation): Promise<SkillFileEntry[]>;
  readFile(location: SkillLocation, path: string): Promise<SkillFile>;
  /** Throws CHANGED_ON_DISK when the file moved on since `baseHash`, unless `overwrite`. */
  saveFile(location: SkillLocation, input: SaveSkillFileInput): Promise<SaveSkillFileResult>;
  /** Earlier versions of one file, newest first. */
  fileVersions(location: SkillLocation, path: string): Promise<SkillFileVersion[]>;
  readFileVersion(location: SkillLocation, path: string, versionId: string): Promise<string>;
  /** Every folder of the skill, empty ones included, by path. `/` separated. */
  folders(location: SkillLocation): Promise<string[]>;
  /**
   * Create an empty file, and the folders on its way. This and the three below change library
   * skills only (other places refuse with UNSUPPORTED); each records the edit and refreshes copy
   * deployments like a save. A taken name is refused (ALREADY_EXISTS), and so is renaming or
   * deleting the main document, which a skill cannot be without.
   */
  createFile(location: SkillLocation, path: string): Promise<SkillFileChangeResult>;
  createFolder(location: SkillLocation, path: string): Promise<SkillFileChangeResult>;
  /** Rename or move a file or folder inside the skill. */
  renameFile(location: SkillLocation, from: string, to: string): Promise<SkillFileChangeResult>;
  /** Delete a file or folder. Every file goes to the earlier versions first. */
  deleteFile(location: SkillLocation, path: string): Promise<SkillFileChangeResult>;
}

/** Instruction files (`CLAUDE.md`, `AGENTS.md`, …) of the available agents. Edited via `editor`. */
export interface InstructionsApi {
  /** Global files when `projectId` is null, else that project's. One entry per distinct file. */
  list(projectId: string | null): Promise<InstructionFile[]>;
  /** Create the (empty) file a location points at. Does nothing when it already exists. */
  create(location: SkillLocation): Promise<InstructionFile>;
}

export interface DeployApi {
  deploy(skillId: string, agentKey: string): Promise<void>;
  undeploy(skillId: string, agentKey: string): Promise<void>;
  /**
   * Add (or remove) every skill × agent pair, skipping pairs already in the wanted state. With
   * `dryRun`, report the same counts and conflicts without writing anything.
   */
  apply(
    skillIds: string[],
    agentKeys: string[],
    action: "add" | "remove",
    options?: ApplyOptions,
  ): Promise<ApplyResult>;
}

export interface InstallApi {
  /** A folder containing a skill, or an archive (`.zip`, `.skill`, `.tar`, `.tar.gz`, `.tgz`). */
  fromPath(sourcePath: string, name?: string, options?: InstallOptions): Promise<Skill>;
  importFolder(folderPath: string): Promise<BatchImportResult>;
  /** Fetch a Git repository, or download an archive link, and list the skills in it. */
  previewGit(repoUrl: string): Promise<GitPreview>;
  /** List the skills in an archive file, for archives that hold more than one. */
  previewArchive(archivePath: string): Promise<GitPreview>;
  /**
   * Refused while the preview's download moved to another site and `acceptRedirect` is unset,
   * and with UNSAFE while the safety scanner flags a ticked skill and `acceptRisk` is unset.
   * Nothing is installed then, and the preview stays open for another try.
   */
  confirmGit(
    previewId: string,
    items: InstallSelection[],
    options?: ConfirmOptions,
  ): Promise<Skill[]>;
  cancelPreview(previewId: string): Promise<void>;
  fromMarket(source: string, skillId: string, options?: InstallOptions): Promise<Skill>;
  /** Returns whether anything was running under that key. */
  cancel(key: string): Promise<boolean>;
  scanLocal(): Promise<ScanResult>;
  importDiscovered(path: string, name?: string, options?: InstallOptions): Promise<Skill>;
  importAllDiscovered(): Promise<BatchImportResult>;
}

/** Safety checks with the optional SkillSpector scanner. */
export interface SafetyApi {
  status(): Promise<SafetyStatus>;
  /** The last report of every library skill that has one. */
  list(): Promise<SafetyRecord[]>;
  scanSkill(skillId: string): Promise<SafetyRecord>;
  /**
   * Scan library skills with no report or a stale one; every skill when `force`. Progress goes
   * out as `install:progress` under `SAFETY_SCAN_LIBRARY_KEY`.
   */
  scanLibrary(force?: boolean): Promise<SafetyScanSummary>;
}

export interface MarketApi {
  /** A ranking; offline, the last copy fetched, with `cachedAt` saying how old it is. */
  board(board: MarketBoard): Promise<MarketListing>;
  /** Live search; offline, the last answer to the same search, with `cachedAt`. */
  search(query: string, limit?: number): Promise<MarketListing>;
  /** Security audits and the `SKILL.md` of one skill, to read before installing it. */
  detail(source: string, skillId: string): Promise<MarketSkillDetail>;
}

export interface UpdateRequestOptions extends InstallOptions {
  /**
   * The upstream revision the user compared against. When upstream moved on since, nothing is
   * installed (CHANGED_ON_DISK): the user never saw what the newer revision changes.
   */
  expectedRevision?: string | null;
}

export interface UpdatesApi {
  check(skillId: string, force?: boolean): Promise<Skill>;
  checkAll(force?: boolean): Promise<BatchResult>;
  /**
   * The new version goes through the safety check first: flagged, it throws UNSAFE with the
   * findings and nothing changes, unless `options.acceptRisk` (the user said update anyway).
   */
  update(
    skillId: string,
    approval?: string | null,
    options?: UpdateRequestOptions,
  ): Promise<UpdateResult>;
  updateMany(skillIds: string[]): Promise<BatchUpdateResult>;
  reimport(
    skillId: string,
    approval?: string | null,
    options?: InstallOptions,
  ): Promise<UpdateResult>;
  relink(
    skillId: string,
    sourcePath: string,
    approval?: string | null,
    options?: InstallOptions,
  ): Promise<UpdateResult>;
  detach(skillId: string): Promise<Skill>;
  sourceDocument(skillId: string): Promise<SourceDocument>;
  sourceDiff(skillId: string, options?: SourceDiffOptions): Promise<SourceDiff>;
}

export interface PresetsApi {
  list(): Promise<Preset[]>;
  create(input: PresetInput): Promise<Preset>;
  update(id: string, input: PresetInput): Promise<Preset>;
  remove(id: string): Promise<void>;
  reorder(ids: string[]): Promise<void>;
  addSkills(id: string, skillIds: string[]): Promise<void>;
  removeSkills(id: string, skillIds: string[]): Promise<void>;
  reorderSkills(id: string, skillIds: string[]): Promise<void>;
  toggles(id: string, skillId: string): Promise<PresetAgentToggle[]>;
  setToggle(id: string, skillId: string, agentKey: string, enabled: boolean): Promise<void>;
  /** Deploy the preset to every enabled agent, honouring per-agent toggles. One-time copy. */
  applyToDefault(id: string): Promise<ApplyResult>;
  /** Undo `applyToDefault`: remove the preset's skills from every enabled agent. */
  removeFromDefault(id: string): Promise<ApplyResult>;
  /** Deployment progress of every preset across the enabled agents, in preset order. */
  deployStatus(): Promise<PresetDeployStatus[]>;
}

export interface WorkspaceApi {
  /** Everything inside one agent's global skills folder, managed or not. */
  list(agentKey: string): Promise<LocalSkill[]>;
  counts(agentKeys: string[]): Promise<Record<string, number>>;
  document(agentKey: string, relativePath: string): Promise<SkillDocument>;
  /** Copy the local skill into the library (new skill, or overwrite its match) and adopt it. */
  upload(agentKey: string, relativePath: string): Promise<Skill>;
  /**
   * Replace the local folder with the library version. Resolves to the Recently removed ids of
   * what was put aside (empty when the folder held nothing the library lacks), for an undo.
   */
  pull(agentKey: string, relativePath: string): Promise<string[]>;
  /** Delete a local skill. Its folder goes to Recently removed; resolves to that entry's id. */
  deleteLocal(agentKey: string, relativePath: string): Promise<string[]>;
  /** Folders in the agent's skills folder that the agent ignores, sorted by path. */
  broken(agentKey: string): Promise<BrokenSkillFolder[]>;
  /** Delete one of `broken`. Refused for anything that is not broken right now, or is managed. */
  deleteBroken(agentKey: string, relativePath: string): Promise<string[]>;
}

export interface ProjectsApi {
  list(): Promise<Project[]>;
  add(path: string): Promise<Project>;
  addLinked(name: string, path: string, disabledPath?: string | null): Promise<Project>;
  remove(id: string): Promise<void>;
  reorder(ids: string[]): Promise<void>;
  setPinned(id: string, pinned: boolean): Promise<void>;
  /** The project page was opened: counts toward the sidebar's Frequent group. */
  recordOpen(id: string): Promise<void>;
  scan(root: string): Promise<string[]>;
  /**
   * Projects the user works in that are not linked yet: from Claude Code's and the editors'
   * recent folders and from Git repositories in the usual code folders. Most recent first.
   */
  suggest(): Promise<ProjectSuggestion[]>;
  targets(id: string): Promise<ProjectTarget[]>;
  skills(id: string): Promise<LocalSkill[]>;
  document(id: string, relativePath: string, agentKey: string): Promise<SkillDocument>;
  exportSkill(skillId: string, id: string, agentKeys?: string[]): Promise<void>;
  /**
   * Write a new skill straight into the project's folders for the chosen agents, not the
   * library. Resolves to the copy to open in the editor.
   */
  createSkill(id: string, input: CreateSkillInput, agentKeys?: string[]): Promise<ProjectCopyRef>;
  /** Push a project skill (all its per-agent copies, given by relative path) to the library. */
  pushToLibrary(
    id: string,
    relativePath: string,
    options?: PushToLibraryOptions,
  ): Promise<PushToLibraryResult>;
  /** Resolves to the Recently removed ids of the copies put aside. */
  pullFromLibrary(id: string, relativePath: string): Promise<string[]>;
  setSkillEnabled(id: string, relativePath: string, enabled: boolean): Promise<void>;
  /** Resolves to the Recently removed ids of the copies put aside. */
  deleteSkill(id: string, relativePath: string, agentKey?: string): Promise<string[]>;
  lastExportAgents(id: string): Promise<string[]>;
  setLastExportAgents(id: string, agentKeys: string[]): Promise<void>;
  reveal(id: string): Promise<void>;
}

export interface BackupApi {
  status(): Promise<BackupStatus>;
  fetch(): Promise<void>;
  init(): Promise<void>;
  setRemote(url: string): Promise<string>;
  removeRemote(): Promise<void>;
  clone(url: string): Promise<void>;
  reclone(url: string): Promise<void>;
  sync(message?: string): Promise<SyncOutcome>;
  pull(): Promise<MergeSummary>;
  snapshots(limit?: number): Promise<Snapshot[]>;
  createSnapshot(): Promise<string>;
  /** Returns the safety snapshot taken before restoring. */
  restore(tag: string): Promise<string>;
  conflicts(): Promise<BackupConflict[]>;
  resolveConflict(skillKey: string, action: ConflictResolution): Promise<string>;
  sizeReport(): Promise<SizeReport>;
  /**
   * What the next backup would push that looks like a key or token, and was not allowed yet.
   * Empty without a remote: nothing leaves this computer then.
   */
  secretFindings(): Promise<SecretFinding[]>;
  /** "Back up anyway": stop holding the backup back for these findings (ids from above). */
  allowSecrets(ids: string[]): Promise<void>;
  /**
   * Fold every commit not pushed yet into one holding only today's files, so a key removed from
   * the files leaves the history the next push sends. Refuses while a key is still in the files.
   */
  cleanUpUnpushed(): Promise<void>;
  deviceName(): Promise<string>;
  setDeviceName(name: string): Promise<string>;
  githubConnect(token: string, repoName: string): Promise<GithubConnectResult>;
  githubDeviceStart(): Promise<DeviceFlowStart>;
  githubDevicePoll(deviceCode: string, repoName: string): Promise<DeviceFlowPoll>;
  githubAuthMethod(): Promise<GithubAuthMethod>;
  /** True when a GitHub OAuth client id is configured, so device sign-in can be offered. */
  githubDeviceAvailable(): Promise<boolean>;
}

export interface SettingsApi {
  all(): Promise<Settings>;
  get<K extends SettingKey>(key: K): Promise<SettingValue<K>>;
  set<K extends SettingKey>(key: K, value: SettingValue<K>): Promise<void>;
}

export interface SystemApi {
  libraryLocation(): Promise<LibraryLocation>;
  setLibraryPath(path: string | null): Promise<LibraryLocation>;
  revealLibrary(): Promise<void>;
  activity(limit?: number): Promise<ActivityEntry[]>;
  diagnostics(): Promise<DiagnosticInfo>;
  logExcerpt(): Promise<LogExcerpt>;
  exportLogs(): Promise<LogExport>;
  lastCrash(): Promise<CrashInfo | null>;
  clearLastCrash(): Promise<void>;
  cliStatus(): Promise<CliStatus>;
  agentControlStatus(): Promise<AgentControlStatus>;
  /** Install the bundled management skill and deploy it to the chosen agents. */
  setupAgentControl(agentKeys: string[]): Promise<Skill>;
  dismissAgentControl(): Promise<void>;
}

/** What Loadout keeps on disk, and emptying the parts that can be rebuilt. */
export interface StorageApi {
  report(): Promise<StorageReport>;
  /** Links and copies Loadout put into agent folders, for the "remove all data" choice. */
  agentFolders(): Promise<AgentFolderSummary>;
  /** Empty one area. Returns the bytes freed. Never touches a clone that is in use. */
  clear(area: ClearableArea): Promise<number>;
  /** Skill folders taken out of agent and project folders, newest first. */
  removed(): Promise<RemovedFolder[]>;
  /** Put one back where it came from. Whatever sits there now is put aside first. */
  restoreRemoved(id: string): Promise<RestoreRemovedResult>;
  /** Delete one for good. */
  deleteRemoved(id: string): Promise<void>;
  revealRemoved(id: string): Promise<void>;
}

export interface LoadoutApi {
  agents: AgentsApi;
  skills: SkillsApi;
  editor: EditorApi;
  instructions: InstructionsApi;
  deploy: DeployApi;
  install: InstallApi;
  market: MarketApi;
  safety: SafetyApi;
  updates: UpdatesApi;
  presets: PresetsApi;
  workspace: WorkspaceApi;
  projects: ProjectsApi;
  backup: BackupApi;
  settings: SettingsApi;
  system: SystemApi;
  storage: StorageApi;
  skillsFile: SkillsFileApi;
  app: AppApi;
}

export type ApiNamespace = keyof LoadoutApi;

/** Everything core implements. */
export type CoreApi = Omit<LoadoutApi, "app">;

/**
 * A record rather than a list so the compiler refuses a namespace added to `CoreApi` but not
 * here: the IPC bridge only forwards namespaces named in `API_NAMESPACES`.
 */
const CORE_NAMESPACE_KEYS: Record<keyof CoreApi, true> = {
  agents: true,
  skills: true,
  editor: true,
  instructions: true,
  deploy: true,
  install: true,
  market: true,
  safety: true,
  updates: true,
  presets: true,
  workspace: true,
  projects: true,
  backup: true,
  settings: true,
  system: true,
  storage: true,
  skillsFile: true,
};

export const CORE_NAMESPACES = Object.keys(CORE_NAMESPACE_KEYS) as (keyof CoreApi)[];

export const API_NAMESPACES: ApiNamespace[] = [...CORE_NAMESPACES, "app"];
