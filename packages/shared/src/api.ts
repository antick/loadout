import type {
  ExportResult,
  ActivityEntry,
  AgentControlStatus,
  AgentInfo,
  ApplyOptions,
  ApplyResult,
  BrokenSkillFolder,
  CliStatus,
  CrashInfo,
  RepairReport,
  CustomAgentInput,
  DiagnosticInfo,
  LibraryLocation,
  LocalSkill,
  PluginSkill,
  LogExcerpt,
  LogExport,
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
  Skill,
  SkillDocument,
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
import type { CreateSkillInput } from "./new-skill";
import type { SafetyRecord, SafetyScanSummary, SafetyStatus } from "./safety";
import type { InstructionFile } from "./instructions";
import type { BackupApi } from "./api-backup";
import type { InstallApi, MarketApi, UpdatesApi } from "./api-install";
import type { SkillsFileApi } from "./api-skills-file";
import type { UsageApi } from "./usage";
import type { DuplicatesApi } from "./duplicates";
import type { PublishApi } from "./publish";
import type { ListingApi } from "./skill-listing";
import type { ProjectSuggestions } from "./project-suggestions";
import type {
  PresetExportOptions,
  PresetExportResult,
  PresetImportOptions,
  PresetImportPlan,
  PresetImportResult,
} from "./preset-share";
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
  /**
   * Mark a skill without a source as the user's own work, or take that back. An own skill is
   * left out when sources are searched. INVALID_INPUT for a skill that has a source.
   */
  setAuthored(skillId: string, authored: boolean): Promise<Skill>;
  /** The file patterns of projects this skill is suggested for; replaces the list. */
  setSuggestFor(skillId: string, patterns: string[]): Promise<Skill>;
  /** The user's note on the skill; null or blank takes it off. Trimmed and capped. */
  setNote(skillId: string, note: string | null): Promise<Skill>;
  /** Make the skill a favourite, or take that back. Already so: nothing changes. */
  setFavorite(skillId: string, favorite: boolean): Promise<Skill>;
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
  /** INVALID_INPUT when the skill is blocked for the agent. */
  deploy(skillId: string, agentKey: string): Promise<void>;
  undeploy(skillId: string, agentKey: string): Promise<void>;
  /**
   * Block or allow a skill for agents. Blocking also removes the skill from an agent it is
   * deployed to (what Loadout put there; nothing else). Unknown agent keys are INVALID_INPUT.
   */
  setBlocked(skillId: string, agentKeys: string[], blocked: boolean): Promise<Skill>;
  /**
   * Add (or remove) every skill × agent pair, skipping pairs already in the wanted state and,
   * when adding, pairs the skill is blocked for. With `dryRun`, report the same counts and
   * conflicts without writing anything.
   */
  apply(
    skillIds: string[],
    agentKeys: string[],
    action: "add" | "remove",
    options?: ApplyOptions,
  ): Promise<ApplyResult>;
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
  /** Write the preset to a file others can import: skills by source, or with their files. */
  exportFile(
    id: string,
    destPath: string,
    options?: PresetExportOptions,
  ): Promise<PresetExportResult>;
  /** Read a preset file (a path or an https link) and say what importing it would do. */
  previewImport(input: string): Promise<PresetImportPlan>;
  /**
   * Import a preset file: install the skills the library lacks, then create the preset. UNSAFE
   * when the safety check flags a skill and `acceptRisk` is unset; what was installed stays.
   */
  importFile(input: string, options?: PresetImportOptions): Promise<PresetImportResult>;
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
  /**
   * Skills the agent's plugins bring (user-wide plugins only), sorted by plugin then name.
   * Empty for agents without plugins. Read only: the agent's plugin manager owns them.
   */
  plugins(agentKey: string): Promise<PluginSkill[]>;
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
  /** Library skills worth adding to the project, from its files. Reads the project folder. */
  suggestSkills(id: string): Promise<ProjectSuggestions>;
  /** Stop (or start again) suggesting a skill for this project. */
  setSuggestionDismissed(id: string, skillId: string, dismissed: boolean): Promise<void>;
  lastExportAgents(id: string): Promise<string[]>;
  setLastExportAgents(id: string, agentKeys: string[]): Promise<void>;
  reveal(id: string): Promise<void>;
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
  /**
   * What the deployment repair found when the app started, or on the last `repairDeployments`;
   * null before it ran or once dismissed.
   */
  repairReport(): Promise<RepairReport | null>;
  /** Put back every recorded deployment that is missing or a broken link, now. */
  repairDeployments(): Promise<RepairReport>;
  dismissRepair(): Promise<void>;
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
  usage: UsageApi;
  duplicates: DuplicatesApi;
  publish: PublishApi;
  listing: ListingApi;
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
  usage: true,
  duplicates: true,
  publish: true,
  listing: true,
};

export const CORE_NAMESPACES = Object.keys(CORE_NAMESPACE_KEYS) as (keyof CoreApi)[];

export const API_NAMESPACES: ApiNamespace[] = [...CORE_NAMESPACES, "app"];
