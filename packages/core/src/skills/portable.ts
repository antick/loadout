import { existsSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";
import { APP_NAME, type Skill, isNewerVersion } from "@loadout/shared";
import type { Database } from "../db/database";
import type { Logger } from "../log";
import type { LibraryPaths } from "../paths";
import { ensureDir, isSkillDir, readDirSafe, writeJsonAtomic } from "../util/fs";
import { hashDir } from "../util/hash";
import { readSkillIdentity } from "./metadata";
import {
  MACHINE_LOCAL_SOURCES,
  type PortablePreset,
  type PortableSkill,
  readBlockedAgents,
  readEditedFiles,
  readFavoritedAt,
  readJsonDir,
  readNote,
  readPortablePreset,
  readPortableSkill,
  readSuggestFor,
  toPortableSkill,
} from "./portable-format";
import type { SkillStore } from "./store";

export {
  type PortablePreset,
  type PortableSkill,
  type PortableSkillFile,
  isSafeRelativePath,
  readBlockedAgents,
  readFavoritedAt,
  readPortableSkillFiles,
  toPortableSkill,
} from "./portable-format";

/**
 * Portable metadata: the parts of the database that must travel with a backup, written as small
 * JSON files inside the skills folder. One file per skill and per preset keeps Git merges clean.
 * Machine-specific values (local source paths, deployments, check times) are left out.
 */

/** Format of the metadata files. Raise it when an older app could not read them correctly. */
export const BACKUP_SCHEMA_VERSION = 1;
export const SCHEMA_FILE = "schema.json";
/**
 * How long a re-index keeps a skill whose folder is missing before dropping it: a folder renamed,
 * checked out or briefly taken away by a sync client comes back within it, a deleted one does not.
 */
export const MISSING_GRACE_MS = 10 * 60_000;

/** See `PortableMetadata.rebuild`. */
export type RebuildMode = "authoritative" | "adopt" | "reindex";

export interface RebuildResult {
  /** Skills whose folder was renamed by hand: their row now points at the new folder. */
  moved: string[];
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
    // Only when it changes: rewriting it on every backup woke the folder watcher, which asked for
    // another backup, which rewrote it again.
    this.#writeIfChanged(schemaPath, {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      createdBy: APP_NAME,
      appVersion:
        recorded && isNewerVersion(recorded, this.#appVersion) ? recorded : this.#appVersion,
    });

    const skillFiles = new Set<string>();
    for (const skill of this.#skills.list()) {
      skillFiles.add(`${skill.id}.json`);
      this.#writeIfChanged(join(this.#skillsMetaDir, `${skill.id}.json`), toPortableSkill(skill));
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
   * Bring the database in line with what is on disk, in one of three modes:
   * - `authoritative` (after a merge or restore): the files are the truth, so skills and presets
   *   without a file are dropped, as are skills whose folder is gone.
   * - `adopt` (after a clone): rows are only added or refreshed; skills whose folder is gone are
   *   dropped.
   * - `reindex` (start, outside changes): rows are only added or refreshed. A folder renamed by
   *   hand keeps its row; a skill whose folder is missing is only dropped once it has stayed away
   *   for `MISSING_GRACE_MS`, so a checkout or a sync client taking it away for a moment costs
   *   nothing.
   * Skill folders nobody knows about are indexed as imported skills. Returns what moved.
   */
  rebuild(options: { mode: RebuildMode; now?: number }): RebuildResult {
    const { mode } = options;
    const authoritative = mode === "authoritative";
    const skillFiles = readJsonDir(this.#skillsMetaDir, readPortableSkill, this.#log);
    const presetFiles = readJsonDir(this.#presetsMetaDir, readPortablePreset, this.#log);
    const hasMetadata = existsSync(join(this.#paths.metadataDir, SCHEMA_FILE));

    return this.#db.transaction(() => {
      const seenSkillIds = new Set<string>();
      for (const file of skillFiles) {
        // Files arrive through backups from other devices: `readPortableSkill` checked them.
        const libraryPath = join(this.#paths.skillsDir, file.path);
        if (!isSkillDir(libraryPath)) continue;
        // The row it updated may carry another id (matched by folder): that id is seen too, or
        // the row would be dropped below with its deployments and presets.
        seenSkillIds.add(file.id);
        seenSkillIds.add(this.#upsertSkill(file, libraryPath));
      }

      const missing: Skill[] = [];
      for (const skill of this.#skills.list()) {
        if (!existsSync(skill.libraryPath)) missing.push(skill);
        else if (authoritative && hasMetadata && !seenSkillIds.has(skill.id)) {
          this.#skills.delete(skill.id);
        }
      }
      const waiting = mode === "reindex" ? missing : [];
      if (mode !== "reindex") for (const skill of missing) this.#skills.delete(skill.id);

      const moved = this.#indexUnknownFolders(waiting);
      if (mode === "reindex") this.#settleMissing(waiting, options.now ?? Date.now());

      if (authoritative && hasMetadata) this.#replacePresets(presetFiles);
      else for (const preset of presetFiles) this.#upsertPreset(preset, false);
      return { moved };
    });
  }

  /**
   * Skills whose folder is still missing: the first re-index that sees it notes the time, one at
   * least `MISSING_GRACE_MS` later drops the row. Rows whose folder is back lose the note.
   */
  #settleMissing(missing: readonly Skill[], now: number): void {
    const since = this.#skills.missingSince();
    const stillMissing = new Set(missing.map((skill) => skill.id));
    for (const id of since.keys()) {
      if (!stillMissing.has(id)) this.#skills.setMissingSince(id, null);
    }
    for (const skill of missing) {
      const first = since.get(skill.id);
      if (first === undefined) {
        this.#skills.setMissingSince(skill.id, now);
        this.#log.info(`The folder of ${skill.name} is missing; kept for now in case it returns`);
      } else if (now - first >= MISSING_GRACE_MS) {
        this.#skills.delete(skill.id);
        this.#log.info(`Removed ${skill.name}: its folder stayed missing`);
      }
    }
  }

  /** Returns the id of the row it updated or inserted. */
  #upsertSkill(file: PortableSkill, libraryPath: string): string {
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
        sourceTrustedHost: file.source.trustedHost ?? null,
        sourceRef: file.source.ref ?? current.sourceRef,
        sourceRevision: file.source.revision ?? current.sourceRevision,
        editedFiles: readEditedFiles(file.editedFiles),
        authored: file.authored === true,
        suggestFor: readSuggestFor(file.suggestFor),
        blockedAgents: readBlockedAgents(file.blockedAgents),
        note: readNote(file.note),
        favoritedAt: readFavoritedAt(file.favoritedAt),
        updatedAt: changed ? Date.now() : current.updatedAt,
      });
      this.#skills.setTags(current.id, file.tags);
      return current.id;
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
      sourceTrustedHost: file.source.trustedHost ?? null,
      sourceRevision: file.source.revision ?? null,
      libraryPath,
      contentHash,
      updateStatus: remote ? "unknown" : "local_only",
      createdAt: file.createdAt,
      editedFiles: readEditedFiles(file.editedFiles),
      authored: file.authored === true,
      suggestFor: readSuggestFor(file.suggestFor),
      blockedAgents: readBlockedAgents(file.blockedAgents),
      note: readNote(file.note),
      favoritedAt: readFavoritedAt(file.favoritedAt),
    });
    this.#skills.setTags(file.id, file.tags);
    return file.id;
  }

  /**
   * Index skill folders no row knows. One that matches a skill whose folder went missing (same
   * content, else the only missing skill of the same name) is that skill renamed by hand: its row
   * follows the folder, keeping its tags, notes and deployments. Matched skills leave `missing`.
   * Returns their ids.
   */
  #indexUnknownFolders(missing: Skill[]): string[] {
    let entries: string[] = [];
    try {
      entries = readdirSync(this.#paths.skillsDir).sort();
    } catch {
      return [];
    }
    const moved: string[] = [];
    for (const name of entries) {
      if (name.startsWith(".")) continue;
      const libraryPath = join(this.#paths.skillsDir, name);
      if (!isSkillDir(libraryPath) || this.#skills.findByLibraryPath(libraryPath)) continue;
      const identity = readSkillIdentity(libraryPath);
      const contentHash = hashDir(libraryPath);
      const sameName = missing.filter((skill) => skill.name === identity.name);
      const match =
        missing.find((skill) => skill.contentHash === contentHash) ??
        (sameName.length === 1 ? sameName[0] : undefined);
      if (match) {
        missing.splice(missing.indexOf(match), 1);
        this.#skills.update(match.id, {
          name: identity.name,
          description: identity.description,
          libraryPath,
          contentHash,
        });
        this.#skills.setMissingSince(match.id, null);
        moved.push(match.id);
        this.#log.info(`Skill folder ${basename(match.libraryPath)} was renamed to ${name}`);
        continue;
      }
      this.#skills.insert({
        name: identity.name,
        description: identity.description,
        sourceType: "import",
        libraryPath,
        contentHash,
        updateStatus: "local_only",
      });
      this.#log.info(`Indexed skill folder found in the library: ${name}`);
    }
    return moved;
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
