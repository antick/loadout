import { existsSync, readFileSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";
import { APP_NAME, type Skill, isNewerVersion } from "@loadout/shared";
import type { Database } from "../db/database";
import type { Logger } from "../log";
import type { LibraryPaths } from "../paths";
import { ensureDir, isSkillDir, sameEntry, writeJsonAtomic } from "../util/fs";
import { contentFingerprint, hashDir } from "../util/hash";
import { readSkillIdentity } from "./metadata";
import {
  MACHINE_LOCAL_SOURCES,
  type PortablePreset,
  type PortableSkill,
  readBlockedAgents,
  readEditedFiles,
  readFavoritedAt,
  PRESET_METADATA_SUBDIR,
  SKILL_METADATA_SUBDIR,
  metadataFileIds,
  metadataFileName,
  readJsonDir,
  readNote,
  readPortablePreset,
  readPortableSkill,
  readSuggestFor,
  toPortableSkill,
} from "./portable-format";
import { PresetStore } from "../presets/store";
import type { SkillStore } from "./store";

export {
  type PortablePreset,
  type PortableSkill,
  type PortableSkillFile,
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
  for (const id of metadataFileIds(dir)) {
    if (!keep.has(id)) unlinkSync(join(dir, metadataFileName(id)));
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
  readonly #presets: PresetStore;
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
    this.#presets = new PresetStore(db);
    this.#log = log;
    this.#appVersion = appVersion;
  }

  get #skillsMetaDir(): string {
    return join(this.#paths.metadataDir, SKILL_METADATA_SUBDIR);
  }

  get #presetsMetaDir(): string {
    return join(this.#paths.metadataDir, PRESET_METADATA_SUBDIR);
  }

  /**
   * Delete one preset's metadata file now, under the lock, with the row. Left for the next
   * `write()`, a re-index running first (at start, or after an outside change) would read the
   * file and put the preset back.
   */
  forgetPreset(id: string): void {
    rmSync(join(this.#presetsMetaDir, metadataFileName(id)), { force: true });
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
      skillFiles.add(skill.id);
      this.#writeIfChanged(
        join(this.#skillsMetaDir, metadataFileName(skill.id)),
        toPortableSkill(skill),
      );
    }
    pruneDir(this.#skillsMetaDir, skillFiles);

    const presetFiles = new Set<string>();
    for (const preset of this.#readPresets()) {
      presetFiles.add(preset.id);
      this.#writeIfChanged(join(this.#presetsMetaDir, metadataFileName(preset.id)), preset);
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
    return this.#presets.list().map((preset) => ({
      id: preset.id,
      name: preset.name,
      description: preset.description,
      icon: preset.icon,
      sortOrder: preset.sortOrder,
      skills: preset.skillIds,
      disabledAgents: preset.switchedOff,
      createdAt: preset.createdAt,
      updatedAt: preset.updatedAt,
    }));
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
      const fingerprints = this.#skills.fingerprints();
      for (const file of skillFiles) {
        // Files arrive through backups from other devices: `readPortableSkill` checked them.
        const libraryPath = join(this.#paths.skillsDir, file.path);
        if (!isSkillDir(libraryPath)) continue;
        // The row it updated may carry another id (matched by folder): that id is seen too, or
        // the row would be dropped below with its deployments and presets.
        seenSkillIds.add(file.id);
        seenSkillIds.add(this.#upsertSkill(file, libraryPath, mode, fingerprints));
      }

      // A file this version cannot read (a hand edit, a source type from a newer version) still
      // says the skill exists: its row stays, or it would come back under a new id.
      const fileIds = metadataFileIds(this.#skillsMetaDir);
      const missing: Skill[] = [];
      for (const skill of this.#skills.list()) {
        if (!existsSync(skill.libraryPath)) missing.push(skill);
        else if (
          authoritative &&
          hasMetadata &&
          !seenSkillIds.has(skill.id) &&
          !fileIds.has(skill.id)
        ) {
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

  /**
   * Returns the id of the row it updated or inserted. A re-index only refreshes what comes from
   * the folder of a skill it already knows: the database owns tags, notes, sources and the rest,
   * and the file may be behind it (written later, under the lock). Merges, restores and clones
   * bring new files on purpose, so they take every field from them.
   */
  #upsertSkill(
    file: PortableSkill,
    libraryPath: string,
    mode: RebuildMode,
    fingerprints: ReadonlyMap<string, string>,
  ): string {
    const identity = readSkillIdentity(libraryPath);
    const current = this.#skills.find(file.id) ?? this.#skills.findByLibraryPath(libraryPath);
    const { contentHash, fingerprint } = this.#hashFolder(libraryPath, current, fingerprints);
    if (current) {
      if (fingerprint !== undefined) this.#skills.setFingerprint(current.id, fingerprint);
      const changed = current.contentHash !== contentHash;
      const fromFolder = {
        name: identity.name,
        description: identity.description,
        libraryPath,
        contentHash,
        updatedAt: changed ? Date.now() : current.updatedAt,
      };
      if (mode === "reindex") {
        const same =
          !changed &&
          current.name === identity.name &&
          current.description === identity.description &&
          current.libraryPath === libraryPath;
        if (!same) this.#skills.patch(current.id, fromFolder);
        return current.id;
      }
      this.#skills.patch(current.id, {
        ...fromFolder,
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
      });
      this.#skills.setTags(current.id, file.tags);
      return current.id;
    }
    const remote = !MACHINE_LOCAL_SOURCES.has(file.source.type);
    this.#skills.add({
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
    if (fingerprint !== undefined) this.#skills.setFingerprint(file.id, fingerprint);
    this.#skills.setTags(file.id, file.tags);
    return file.id;
  }

  /**
   * The folder's content hash. Read from the files only when the stat-walk fingerprint recorded
   * with the row's hash no longer matches: a re-index of an unchanged library reads no file
   * bytes. `fingerprint` is what to record next to the hash, undefined when that stays.
   */
  #hashFolder(
    libraryPath: string,
    row: Skill | null,
    fingerprints: ReadonlyMap<string, string>,
  ): { contentHash: string | null; fingerprint: string | null | undefined } {
    const stamp = contentFingerprint(libraryPath);
    const recorded = row ? fingerprints.get(row.id) : undefined;
    if (row?.contentHash && stamp && recorded === `${stamp}:${row.contentHash}`) {
      return { contentHash: row.contentHash, fingerprint: undefined };
    }
    const contentHash = hashDir(libraryPath);
    const fingerprint = stamp && contentHash ? `${stamp}:${contentHash}` : null;
    return { contentHash, fingerprint: fingerprint === recorded ? undefined : fingerprint };
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
      // The folder a row knows, renamed only in letter case: the row takes the name on disk.
      const recased = this.#skills.findByDirName(name);
      if (recased && sameEntry(recased.libraryPath, libraryPath)) {
        this.#skills.patch(recased.id, { libraryPath });
        moved.push(recased.id);
        this.#log.info(`Skill folder ${basename(recased.libraryPath)} was renamed to ${name}`);
        continue;
      }
      const identity = readSkillIdentity(libraryPath);
      const contentHash = hashDir(libraryPath);
      const sameName = missing.filter((skill) => skill.name === identity.name);
      const match =
        missing.find((skill) => skill.contentHash === contentHash) ??
        (sameName.length === 1 ? sameName[0] : undefined);
      if (match) {
        missing.splice(missing.indexOf(match), 1);
        this.#skills.patch(match.id, {
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
      this.#skills.add({
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
    this.#presets.deleteExcept(new Set(files.map((f) => f.id)));
    for (const file of files) this.#upsertPreset(file, true);
  }

  #upsertPreset(file: PortablePreset, replaceMembers: boolean): void {
    if (!replaceMembers && this.#presets.find(file.id)) return;
    this.#presets.put({
      id: file.id,
      name: file.name,
      description: file.description,
      icon: file.icon,
      sortOrder: file.sortOrder,
      skillIds: file.skills.filter((skillId) => this.#skills.find(skillId) !== null),
      switchedOff: file.disabledAgents,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    });
  }
}
