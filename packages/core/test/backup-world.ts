import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppEvents, BackupApi, Skill } from "@loadout/shared";
import { type BackupHooks, type BackupService, createBackupService } from "../src/backup";
import type { SecretStore } from "../src/context";
import { type ContextBundle, createContext } from "../src/create-context";
import { silentLogger } from "../src/log";
import { INTERNAL_KEYS } from "../src/settings/store";
import { removePathSync } from "../src/util/fs";
import { hashDir } from "../src/util/hash";
import { makeSkill, writeFile } from "./helpers";

/** Two or more "devices" (each a full library) sharing one bare remote on local disk. */

export interface MemorySecrets extends SecretStore {
  values: Map<string, string>;
}

export function memorySecrets(available = true): MemorySecrets {
  const values = new Map<string, string>();
  return {
    values,
    available: () => available,
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => {
      values.set(key, value);
    },
    delete: async (key) => {
      values.delete(key);
    },
  };
}

/** Keep the developer's own git settings (signing, hooks, default branch) out of the tests. */
export function isolateGit(root: string): void {
  const config = join(root, "gitconfig");
  writeFileSync(config, "");
  process.env.GIT_CONFIG_GLOBAL = config;
  process.env.GIT_CONFIG_NOSYSTEM = "1";
}

export function rawGit(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

export function createBareRemote(root: string, name = "remote.git"): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  rawGit(dir, "init", "-q", "--bare");
  return dir;
}

export interface RecordedEvent {
  event: keyof AppEvents;
  payload: unknown;
}

export interface Device extends ContextBundle {
  name: string;
  skillsDir: string;
  service: BackupService;
  api: BackupApi;
  secrets: MemorySecrets;
  events: RecordedEvent[];
  /** How often core was asked to refresh deployed copies. */
  contentChanges: { count: number };
  addSkill(dirName: string, options?: { body?: string; tags?: string[] }): Skill;
  editSkill(dirName: string, body: string): void;
  renameSkill(dirName: string, next: string): void;
  deleteSkill(dirName: string): void;
  addPreset(name: string, skillIds: string[]): string;
  skill(dirName: string): Skill | null;
  read(dirName: string, file?: string): string;
  git(...args: string[]): string;
}

export interface DeviceOptions {
  hooks?: BackupHooks;
  fetchImpl?: typeof fetch;
  secrets?: MemorySecrets;
  /** App version this device runs; the context default when left out. */
  appVersion?: string;
}

export function createDevice(root: string, name: string, options: DeviceOptions = {}): Device {
  const home = join(root, `home-${name}`);
  const base = join(home, ".library");
  mkdirSync(home, { recursive: true });
  const secrets = options.secrets ?? memorySecrets();
  const events: RecordedEvent[] = [];
  const bundle = createContext({
    homeDir: home,
    configDir: join(root, `config-${name}`),
    baseDir: base,
    logger: silentLogger,
    secrets,
    emit: (event, payload) => events.push({ event, payload }),
    host: options.appVersion ? { appVersion: options.appVersion } : undefined,
  });
  const { ctx, store } = bundle;
  ctx.settings.setRaw(INTERNAL_KEYS.backupDeviceName, `Device ${name}`);
  const contentChanges = { count: 0 };
  const service = createBackupService(ctx, {
    store,
    portable: bundle.portable,
    fetchImpl: options.fetchImpl,
    hooks: options.hooks,
    afterContentChange: () => {
      contentChanges.count += 1;
    },
  });
  const skillsDir = ctx.paths.skillsDir;
  const skill = (dirName: string): Skill | null =>
    store.findByLibraryPath(join(skillsDir, dirName));

  return {
    ...bundle,
    name,
    skillsDir,
    service,
    api: service.api,
    secrets,
    events,
    contentChanges,
    skill,
    addSkill: (dirName, skillOptions = {}) => {
      const dir = makeSkill(skillsDir, dirName, { body: skillOptions.body });
      const row = store.insert({
        name: dirName,
        description: `Test skill ${dirName}`,
        sourceType: "local",
        libraryPath: dir,
        contentHash: hashDir(dir),
        updateStatus: "local_only",
      });
      if (skillOptions.tags) store.setTags(row.id, skillOptions.tags);
      return store.get(row.id);
    },
    editSkill: (dirName, body) => writeFile(join(skillsDir, dirName, "notes.md"), body),
    renameSkill: (dirName, next) => {
      const row = skill(dirName);
      if (!row) throw new Error(`No skill at ${dirName}`);
      renameSync(join(skillsDir, dirName), join(skillsDir, next));
      store.update(row.id, { libraryPath: join(skillsDir, next) });
    },
    deleteSkill: (dirName) => {
      const row = skill(dirName);
      if (!row) throw new Error(`No skill at ${dirName}`);
      removePathSync(join(skillsDir, dirName));
      store.delete(row.id);
    },
    addPreset: (presetName, skillIds) => {
      const id = randomUUID();
      const now = Date.now();
      ctx.db.run(
        "INSERT INTO presets(id, name, description, icon, sort_order, created_at, updated_at) VALUES(?, ?, NULL, NULL, 0, ?, ?)",
        id,
        presetName,
        now,
        now,
      );
      skillIds.forEach((skillId, index) => {
        ctx.db.run(
          "INSERT INTO preset_skills(preset_id, skill_id, sort_order, added_at) VALUES(?, ?, ?, ?)",
          id,
          skillId,
          index,
          now,
        );
      });
      return id;
    },
    read: (dirName, file = "notes.md") => readFileSync(join(skillsDir, dirName, file), "utf8"),
    git: (...args) => rawGit(skillsDir, ...args),
  };
}

/** Device A with a repository pushed to a fresh remote, holding the given skills. */
export async function seedRemote(
  root: string,
  skills: string[],
): Promise<{ a: Device; remote: string }> {
  const remote = createBareRemote(root);
  const a = createDevice(root, "A");
  for (const name of skills) a.addSkill(name);
  await a.api.init();
  await a.api.setRemote(remote);
  await a.api.sync();
  return { a, remote };
}

/** A second device that adopted the same remote. */
export async function joinRemote(
  root: string,
  remote: string,
  name = "B",
  options: DeviceOptions = {},
): Promise<Device> {
  const device = createDevice(root, name, options);
  await device.api.clone(remote);
  return device;
}
