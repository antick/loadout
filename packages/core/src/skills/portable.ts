import { existsSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { SourceType } from "@loadout/shared";
import { APP_NAME, isNewerVersion } from "@loadout/shared";
import type { Database } from "../db/database";
import type { Logger } from "../log";
import type { LibraryPaths } from "../paths";
import { ensureDir, isSkillDir, readDirSafe, writeJsonAtomic } from "../util/fs";
import { hashDir } from "../util/hash";
import { readSkillIdentity } from "./metadata";
import type { SkillStore } from "./store";

/**
 * Portable metadata: the parts of the database that must travel with a backup, written as small
 * JSON files inside the skills folder. One file per skill and per preset keeps Git merges clean.
 * Machine-specific values (local source paths, deployments, check times) are left out.
 */

/** Format of the metadata files. Raise it when an older app could not read them correctly. */
export const BACKUP_SCHEMA_VERSION = 1;
export const SCHEMA_FILE = "schema.json";
const MACHINE_LOCAL_SOURCES: ReadonlySet<SourceType> = new Set(["local", "import"]);

export interface PortableSkill {
  id: string;
  /** Folder name inside the skills folder. */
  path: string;
  tags: string[];
  source: {
    type: SourceType;
    ref?: string | null;
    url?: string | null;
    subpath?: string | null;
    branch?: string | null;
    revision?: string | null;
  };
  createdAt: number;
  /** Files edited in the app since the skill came from its source. Left out when none. */
  editedFiles?: string[];
}

export interface PortablePreset {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  /** Skill ids in display order. */
  skills: string[];
  /** Only switches turned off are stored: skill id → agent keys. */
  disabledAgents: Record<string, string[]>;
  createdAt: number;
  updatedAt: number;
}

/** A relative, `/` separated path that stays inside the folder it is relative to. */
function isSafeRelativePath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0 || path.includes("\0")) return false;
  if (path.startsWith("/") || path.includes("\\") || /^[A-Za-z]:/.test(path)) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/** Edited paths from a file that may come from another device; anything unsafe is dropped. */
export function readEditedFiles(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter(isSafeRelativePath))].sort() : [];
}

/** A metadata file may only name a plain folder directly inside the skills folder. */
export function isSafeLibraryDirName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name !== "." &&
    name !== ".." &&
    !name.startsWith(".") &&
    !/[\\/\0]/.test(name)
  );
}

function readJsonDir<T>(dir: string): T[] {
  const items: T[] = [];
  for (const entry of readDirSafe(dir)) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      items.push(JSON.parse(readFileSync(join(dir, entry.name), "utf8")) as T);
    } catch {
      // A half-merged or hand-edited file is skipped rather than failing the whole rebuild.
    }
  }
  return items;
}

function pruneDir(dir: string, keep: ReadonlySet<string>): void {
  for (const entry of readDirSafe(dir)) {
    if (entry.isFile() && entry.name.endsWith(".json") && !keep.has(entry.name)) {
      unlinkSync(join(dir, entry.name));
    }
  }
}

/** What `schema.json` says about the library it sits in. */
export interface SchemaInfo {
  schemaVersion: number;
  /** Highest app version that has written this library; null in files from before it was kept. */
  appVersion: string | null;
}

/** Read a `schema.json` text; null when it is missing or not understood. */
export function parseSchemaInfo(raw: string | null): SchemaInfo | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { schemaVersion?: unknown; appVersion?: unknown };
    if (typeof value.schemaVersion !== "number") return null;
    return {
      schemaVersion: value.schemaVersion,
      appVersion: typeof value.appVersion === "string" ? value.appVersion : null,
    };
  } catch {
    return null;
  }
}

function readSchemaFile(path: string): SchemaInfo | null {
  return existsSync(path) ? parseSchemaInfo(readFileSync(path, "utf8")) : null;
}

export class PortableMetadata {
  readonly #paths: LibraryPaths;
  readonly #db: Database;
  readonly #skills: SkillStore;
  readonly #log: Logger;
  readonly #appVersion: string;

  constructor(
    paths: LibraryPaths,
    db: Database,
    skills: SkillStore,
    log: Logger,
    appVersion: string,
  ) {
    this.#paths = paths;
    this.#db = db;
    this.#skills = skills;
    this.#log = log;
    this.#appVersion = appVersion;
  }

  get #skillsMetaDir(): string {
    return join(this.#paths.metadataDir, "skills");
  }

  get #presetsMetaDir(): string {
    return join(this.#paths.metadataDir, "presets");
  }

  /** Rewrite every metadata file from the database and delete stale ones. */
  write(): void {
    ensureDir(this.#skillsMetaDir);
    ensureDir(this.#presetsMetaDir);
    // The recorded app version only ever goes up, so an older computer syncing the library does
    // not hide from the others that a newer version is in use.
    const schemaPath = join(this.#paths.metadataDir, SCHEMA_FILE);
    const recorded = readSchemaFile(schemaPath)?.appVersion ?? null;
    writeJsonAtomic(schemaPath, {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      createdBy: APP_NAME,
      appVersion:
        recorded && isNewerVersion(recorded, this.#appVersion) ? recorded : this.#appVersion,
    });

    const skillFiles = new Set<string>();
    for (const skill of this.#skills.list()) {
      const local = MACHINE_LOCAL_SOURCES.has(skill.sourceType);
      const file: PortableSkill = {
        id: skill.id,
        path: skill.dirName,
        tags: [...skill.tags].sort(),
        source: {
          type: skill.sourceType,
          ref: local ? undefined : skill.sourceRef,
          url: skill.sourceUrl,
          subpath: skill.sourceSubpath,
          branch: skill.sourceBranch,
          revision: skill.sourceRevision,
        },
        createdAt: skill.createdAt,
        editedFiles: skill.editedFiles.length > 0 ? [...skill.editedFiles].sort() : undefined,
      };
      skillFiles.add(`${skill.id}.json`);
      this.#writeIfChanged(join(this.#skillsMetaDir, `${skill.id}.json`), file);
    }
    pruneDir(this.#skillsMetaDir, skillFiles);

    const presetFiles = new Set<string>();
    for (const preset of this.#readPresets()) {
      presetFiles.add(`${preset.id}.json`);
      this.#writeIfChanged(join(this.#presetsMetaDir, `${preset.id}.json`), preset);
    }
    pruneDir(this.#presetsMetaDir, presetFiles);
  }

  #writeIfChanged(path: string, value: unknown): void {
    const next = `${JSON.stringify(value, null, 2)}\n`;
    try {
      if (existsSync(path) && readFileSync(path, "utf8") === next) return;
    } catch {
      // Fall through and rewrite.
    }
    writeJsonAtomic(path, value);
  }

  #readPresets(): PortablePreset[] {
    const rows = this.#db.all<{
      id: string;
      name: string;
      description: string | null;
      icon: string | null;
      sort_order: number;
      created_at: number;
      updated_at: number;
    }>("SELECT * FROM presets ORDER BY sort_order, created_at");
    return rows.map((row) => {
      const skills = this.#db
        .all<{ skill_id: string }>(
          "SELECT skill_id FROM preset_skills WHERE preset_id = ? ORDER BY sort_order, added_at",
          row.id,
        )
        .map((r) => r.skill_id);
      const disabledAgents: Record<string, string[]> = {};
      for (const off of this.#db.all<{ skill_id: string; agent_key: string }>(
        "SELECT skill_id, agent_key FROM preset_skill_agents WHERE preset_id = ? AND enabled = 0 ORDER BY skill_id, agent_key",
        row.id,
      )) {
        disabledAgents[off.skill_id] = [...(disabledAgents[off.skill_id] ?? []), off.agent_key];
      }
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        icon: row.icon,
        sortOrder: row.sort_order,
        skills,
        disabledAgents,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
  }

  /**
   * Bring the database in line with what is on disk.
   * `authoritative` (after clone, merge or restore): the files are the truth, so skills and
   * presets without a file are dropped. Otherwise (normal start) rows are only added or refreshed,
   * and skill folders nobody knows about are indexed as imported skills.
   */
  rebuild(options: { authoritative: boolean }): void {
    const skillFiles = readJsonDir<PortableSkill>(this.#skillsMetaDir);
    const presetFiles = readJsonDir<PortablePreset>(this.#presetsMetaDir);
    const hasMetadata = existsSync(join(this.#paths.metadataDir, "schema.json"));

    this.#db.transaction(() => {
      const seenSkillIds = new Set<string>();
      for (const file of skillFiles) {
        // Files arrive through backups from other devices: never trust their paths.
        if (!isSafeLibraryDirName(file.path) || typeof file.id !== "string") continue;
        const libraryPath = join(this.#paths.skillsDir, file.path);
        if (!isSkillDir(libraryPath)) continue;
        seenSkillIds.add(file.id);
        this.#upsertSkill(file, libraryPath);
      }

      for (const skill of this.#skills.list()) {
        const dirGone = !existsSync(skill.libraryPath);
        const dropped = options.authoritative && hasMetadata && !seenSkillIds.has(skill.id);
        if (dirGone || dropped) this.#skills.delete(skill.id);
      }

      this.#indexUnknownFolders();

      if (options.authoritative && hasMetadata) this.#replacePresets(presetFiles);
      else for (const preset of presetFiles) this.#upsertPreset(preset, false);
    });
  }

  #upsertSkill(file: PortableSkill, libraryPath: string): void {
    const identity = readSkillIdentity(libraryPath);
    const contentHash = hashDir(libraryPath);
    const current = this.#skills.find(file.id) ?? this.#skills.findByLibraryPath(libraryPath);
    if (current) {
      const changed = current.contentHash !== contentHash;
      this.#skills.update(current.id, {
        name: identity.name,
        description: identity.description,
        libraryPath,
        contentHash,
        sourceType: file.source.type,
        sourceUrl: file.source.url ?? current.sourceUrl,
        sourceSubpath: file.source.subpath ?? null,
        sourceBranch: file.source.branch ?? null,
        sourceRef: file.source.ref ?? current.sourceRef,
        sourceRevision: file.source.revision ?? current.sourceRevision,
        editedFiles: readEditedFiles(file.editedFiles),
        updatedAt: changed ? Date.now() : current.updatedAt,
      });
      this.#skills.setTags(current.id, file.tags);
      return;
    }
    const remote = !MACHINE_LOCAL_SOURCES.has(file.source.type);
    this.#skills.insert({
      id: file.id,
      name: identity.name,
      description: identity.description,
      sourceType: file.source.type,
      sourceRef: file.source.ref ?? null,
      sourceUrl: file.source.url ?? null,
      sourceSubpath: file.source.subpath ?? null,
      sourceBranch: file.source.branch ?? null,
      sourceRevision: file.source.revision ?? null,
      libraryPath,
      contentHash,
      updateStatus: remote ? "unknown" : "local_only",
      createdAt: file.createdAt,
      editedFiles: readEditedFiles(file.editedFiles),
    });
    this.#skills.setTags(file.id, file.tags);
  }

  #indexUnknownFolders(): void {
    let entries: string[] = [];
    try {
      entries = readdirSync(this.#paths.skillsDir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name.startsWith(".")) continue;
      const libraryPath = join(this.#paths.skillsDir, name);
      if (!isSkillDir(libraryPath) || this.#skills.findByLibraryPath(libraryPath)) continue;
      const identity = readSkillIdentity(libraryPath);
      this.#skills.insert({
        name: identity.name,
        description: identity.description,
        sourceType: "import",
        libraryPath,
        contentHash: hashDir(libraryPath),
        updateStatus: "local_only",
      });
      this.#log.info(`Indexed skill folder found in the library: ${name}`);
    }
  }

  #replacePresets(files: PortablePreset[]): void {
    const keep = new Set(files.map((f) => f.id));
    for (const row of this.#db.all<{ id: string }>("SELECT id FROM presets")) {
      if (!keep.has(row.id)) this.#db.run("DELETE FROM presets WHERE id = ?", row.id);
    }
    for (const file of files) this.#upsertPreset(file, true);
  }

  #upsertPreset(file: PortablePreset, replaceMembers: boolean): void {
    const existing = this.#db.get<{ id: string }>("SELECT id FROM presets WHERE id = ?", file.id);
    if (existing && !replaceMembers) return;
    // Another preset may already hold this name (created separately on two devices).
    const clash = this.#db.get<{ id: string }>(
      "SELECT id FROM presets WHERE name = ? AND id <> ?",
      file.name,
      file.id,
    );
    const name = clash ? `${file.name} (${file.id.slice(0, 4)})` : file.name;
    this.#db.run(
      `INSERT INTO presets(id, name, description, icon, sort_order, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description,
         icon = excluded.icon, sort_order = excluded.sort_order, updated_at = excluded.updated_at`,
      file.id,
      name,
      file.description,
      file.icon,
      file.sortOrder,
      file.createdAt,
      file.updatedAt,
    );
    this.#db.run("DELETE FROM preset_skills WHERE preset_id = ?", file.id);
    this.#db.run("DELETE FROM preset_skill_agents WHERE preset_id = ?", file.id);
    file.skills.forEach((skillId, index) => {
      if (!this.#skills.find(skillId)) return;
      this.#db.run(
        "INSERT OR IGNORE INTO preset_skills(preset_id, skill_id, sort_order, added_at) VALUES(?, ?, ?, ?)",
        file.id,
        skillId,
        index,
        file.updatedAt,
      );
      for (const agentKey of file.disabledAgents[skillId] ?? []) {
        this.#db.run(
          "INSERT OR REPLACE INTO preset_skill_agents(preset_id, skill_id, agent_key, enabled, updated_at) VALUES(?, ?, ?, 0, ?)",
          file.id,
          skillId,
          agentKey,
          file.updatedAt,
        );
      }
    });
  }
}
