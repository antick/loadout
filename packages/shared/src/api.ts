import type {
  ActivityEntry,
  AgentControlStatus,
  AgentInfo,
  AppInfo,
  AppUpdateInfo,
  ApplyResult,
  BackupConflict,
  BackupStatus,
  BatchImportResult,
  BatchResult,
  BatchUpdateResult,
  CliStatus,
  ConflictResolution,
  CrashInfo,
  CustomAgentInput,
  DeviceFlowPoll,
  DeviceFlowStart,
  DiagnosticInfo,
  GitPreview,
  GithubAuthMethod,
  GithubConnectResult,
  InstallSelection,
  LibraryLocation,
  LocalSkill,
  LogExcerpt,
  LogExport,
  MarketBoard,
  MarketSkill,
  MergeSummary,
  Preset,
  PresetAgentToggle,
  PresetInput,
  Project,
  ProjectTarget,
  PushToLibraryResult,
  ScanResult,
  SizeReport,
  Skill,
  SkillDocument,
  Snapshot,
  SourceDiff,
  SourceDocument,
  SyncOutcome,
  UpdateResult,
} from "./types";
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
  document(skillId: string): Promise<SkillDocument>;
  remove(skillId: string): Promise<void>;
  removeMany(skillIds: string[]): Promise<BatchResult>;
  allTags(): Promise<string[]>;
  setTags(skillId: string, tags: string[]): Promise<void>;
  renameTag(from: string, to: string): Promise<void>;
  deleteTag(tag: string): Promise<void>;
  /** Open the skill's library folder in the OS file manager. */
  reveal(skillId: string): Promise<void>;
}

export interface DeployApi {
  deploy(skillId: string, agentKey: string): Promise<void>;
  undeploy(skillId: string, agentKey: string): Promise<void>;
  /** Add (or remove) every skill × agent pair, skipping pairs already in the wanted state. */
  apply(skillIds: string[], agentKeys: string[], action: "add" | "remove"): Promise<ApplyResult>;
}

export interface InstallApi {
  /** A folder containing a skill, or a `.zip` / `.skill` archive. */
  fromPath(sourcePath: string, name?: string): Promise<Skill>;
  importFolder(folderPath: string): Promise<BatchImportResult>;
  previewGit(repoUrl: string): Promise<GitPreview>;
  confirmGit(previewId: string, items: InstallSelection[]): Promise<Skill[]>;
  cancelPreview(previewId: string): Promise<void>;
  fromMarket(source: string, skillId: string): Promise<Skill>;
  /** Returns whether anything was running under that key. */
  cancel(key: string): Promise<boolean>;
  scanLocal(): Promise<ScanResult>;
  importDiscovered(path: string, name?: string): Promise<Skill>;
  importAllDiscovered(): Promise<BatchImportResult>;
}

export interface MarketApi {
  board(board: MarketBoard): Promise<MarketSkill[]>;
  search(query: string, limit?: number): Promise<MarketSkill[]>;
}

export interface UpdatesApi {
  check(skillId: string, force?: boolean): Promise<Skill>;
  checkAll(force?: boolean): Promise<BatchResult>;
  update(skillId: string, approval?: string | null): Promise<UpdateResult>;
  updateMany(skillIds: string[]): Promise<BatchUpdateResult>;
  reimport(skillId: string, approval?: string | null): Promise<UpdateResult>;
  relink(skillId: string, sourcePath: string, approval?: string | null): Promise<UpdateResult>;
  detach(skillId: string): Promise<Skill>;
  sourceDocument(skillId: string): Promise<SourceDocument>;
  sourceDiff(skillId: string): Promise<SourceDiff>;
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
}

export interface WorkspaceApi {
  /** Everything inside one agent's global skills folder, managed or not. */
  list(agentKey: string): Promise<LocalSkill[]>;
  counts(agentKeys: string[]): Promise<Record<string, number>>;
  document(agentKey: string, relativePath: string): Promise<SkillDocument>;
  /** Copy the local skill into the library (new skill, or overwrite its match) and adopt it. */
  upload(agentKey: string, relativePath: string): Promise<Skill>;
  pull(agentKey: string, relativePath: string): Promise<void>;
  deleteLocal(agentKey: string, relativePath: string): Promise<void>;
}

export interface ProjectsApi {
  list(): Promise<Project[]>;
  add(path: string): Promise<Project>;
  addLinked(name: string, path: string, disabledPath?: string | null): Promise<Project>;
  remove(id: string): Promise<void>;
  reorder(ids: string[]): Promise<void>;
  scan(root: string): Promise<string[]>;
  targets(id: string): Promise<ProjectTarget[]>;
  skills(id: string): Promise<LocalSkill[]>;
  document(id: string, relativePath: string, agentKey: string): Promise<SkillDocument>;
  exportSkill(skillId: string, id: string, agentKeys?: string[]): Promise<void>;
  /** Push a project skill (all its per-agent copies, given by relative path) to the library. */
  pushToLibrary(id: string, relativePath: string): Promise<PushToLibraryResult>;
  pullFromLibrary(id: string, relativePath: string): Promise<void>;
  setSkillEnabled(id: string, relativePath: string, enabled: boolean): Promise<void>;
  deleteSkill(id: string, relativePath: string, agentKey?: string): Promise<void>;
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

/** Implemented by the Electron main process, not by core. */
export interface AppApi {
  info(): Promise<AppInfo>;
  pickFolder(title?: string): Promise<string | null>;
  pickArchive(): Promise<string | null>;
  openExternal(url: string): Promise<void>;
  revealPath(path: string): Promise<void>;
  copyText(text: string): Promise<void>;
  checkUpdate(): Promise<AppUpdateInfo>;
  quit(): Promise<void>;
  hideToTray(): Promise<void>;
  restart(): Promise<void>;
  /** Answer the "close or minimise?" prompt raised by `window:close-requested`. */
  resolveClose(action: "hide" | "quit", remember: boolean): Promise<void>;
}

export interface SkillboardApi {
  agents: AgentsApi;
  skills: SkillsApi;
  deploy: DeployApi;
  install: InstallApi;
  market: MarketApi;
  updates: UpdatesApi;
  presets: PresetsApi;
  workspace: WorkspaceApi;
  projects: ProjectsApi;
  backup: BackupApi;
  settings: SettingsApi;
  system: SystemApi;
  app: AppApi;
}

export type ApiNamespace = keyof SkillboardApi;

/** Everything core implements. */
export type CoreApi = Omit<SkillboardApi, "app">;

export const CORE_NAMESPACES = [
  "agents",
  "skills",
  "deploy",
  "install",
  "market",
  "updates",
  "presets",
  "workspace",
  "projects",
  "backup",
  "settings",
  "system",
] as const satisfies readonly (keyof CoreApi)[];

export const API_NAMESPACES = [...CORE_NAMESPACES, "app"] as const;
