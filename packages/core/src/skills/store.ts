import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import type { DeployMode, Deployment, Skill, SourceType, UpdateStatus } from "@loadout/shared";
import type { Database } from "../db/database";
import { notFound } from "../errors";
import type { SkillInspector } from "./checks";
import {
  type DeploymentRecord,
  type DeploymentRow,
  HYDRATE_BY_ID_MAX,
  type InstalledSnapshot,
  LIST_COLUMNS,
  type NewSkill,
  PATCH_COLUMNS,
  type PresetRow,
  type SkillPatch,
  type SkillRow,
  type TagRow,
  append,
  decodeList,
  encodeList,
  toDeployment,
} from "./store-rows";

export type { DeploymentRecord, InstalledSnapshot, NewSkill, SkillPatch } from "./store-rows";

/**
 * What a skill says and holds. Changing one is an edit, which moves `updatedAt` (Changed, and the
 * Recently updated sort); where it comes from, how it was checked, its agents and notes do not.
 */
const EDIT_FIELDS = [
  "name",
  "description",
  "contentHash",
] as const satisfies readonly (keyof SkillPatch)[];

const NO_CHECKS: SkillInspector = {
  factsOf: () => ({ issues: [], manualOnly: false, traits: [], behaviorFields: [] }),
};

/**
 * All reads and writes of skills, tags and deployments. No filesystem work happens here: the
 * format checks attached to each skill come from `inspector`, which caches them per content hash.
 */
export class SkillStore {
  readonly #db: Database;
  readonly #inspector: SkillInspector;

  constructor(db: Database, inspector: SkillInspector = NO_CHECKS) {
    this.#db = db;
    this.#inspector = inspector;
  }

  /**
   * Rows of a related table for the skills being read. A few skills (one `find`) read only
   * their own rows; a long list reads the whole table at once.
   */
  #related<T>(select: string, column: string, ids: readonly string[], order = ""): T[] {
    if (ids.length > HYDRATE_BY_ID_MAX) return this.#db.all<T>(`${select} ${order}`);
    const where = `WHERE ${column} IN (${ids.map(() => "?").join(", ")})`;
    return this.#db.all<T>(`${select} ${where} ${order}`, ...ids);
  }

  #hydrate(rows: SkillRow[]): Skill[] {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const deployments = new Map<string, Deployment[]>();
    const deploymentRows = this.#related<DeploymentRow>(
      "SELECT * FROM deployments",
      "skill_id",
      ids,
      "ORDER BY agent_key",
    );
    for (const row of deploymentRows) {
      const { sourceHash: _sourceHash, ...deployment } = toDeployment(row);
      append(deployments, row.skill_id, deployment);
    }
    const tags = new Map<string, string[]>();
    const tagSql = "SELECT skill_id, tag FROM skill_tags";
    for (const row of this.#related<TagRow>(tagSql, "skill_id", ids, "ORDER BY tag")) {
      append(tags, row.skill_id, row.tag);
    }
    const presets = new Map<string, string[]>();
    const presetSql = "SELECT skill_id, preset_id FROM preset_skills";
    for (const row of this.#related<PresetRow>(presetSql, "skill_id", ids)) {
      append(presets, row.skill_id, row.preset_id);
    }
    const conflictSql = "SELECT skill_key FROM backup_conflicts";
    const conflicts = new Set(
      this.#related<{ skill_key: string }>(conflictSql, "skill_key", ids).map((r) => r.skill_key),
    );
    return rows.map((row) => this.#toSkill(row, { deployments, tags, presets, conflicts }));
  }

  #toSkill(
    row: SkillRow,
    related: {
      deployments: Map<string, Deployment[]>;
      tags: Map<string, string[]>;
      presets: Map<string, string[]>;
      conflicts: Set<string>;
    },
  ): Skill {
    const { deployments, tags, presets, conflicts } = related;
    const facts = this.#inspector.factsOf({
      id: row.id,
      libraryPath: row.library_path,
      contentHash: row.content_hash,
    });
    return {
      id: row.id,
      name: row.name,
      dirName: basename(row.library_path),
      description: row.description,
      sourceType: row.source_type as SourceType,
      sourceRef: row.source_ref,
      sourceUrl: row.source_url,
      sourceSubpath: row.source_subpath,
      sourceBranch: row.source_branch,
      sourceTrustedHost: row.source_trusted_host ?? null,
      sourceRevision: row.source_revision,
      remoteRevision: row.remote_revision,
      updateStatus: row.update_status as UpdateStatus,
      lastCheckedAt: row.last_checked_at,
      lastCheckError: row.last_check_error,
      libraryPath: row.library_path,
      contentHash: row.content_hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deployments: deployments.get(row.id) ?? [],
      presetIds: presets.get(row.id) ?? [],
      tags: tags.get(row.id) ?? [],
      hasConflict: conflicts.has(row.id),
      editedFiles: decodeList(row.edited_files),
      issues: facts.issues,
      manualOnly: facts.manualOnly,
      traits: facts.traits,
      behaviorFields: facts.behaviorFields,
      authored: row.authored === 1,
      suggestFor: decodeList(row.suggest_for),
      blockedAgents: decodeList(row.blocked_agents),
      note: row.note ?? null,
      favoritedAt: row.favorited_at ?? null,
    };
  }

  list(): Skill[] {
    return this.#hydrate(
      this.#db.all<SkillRow>("SELECT * FROM skills ORDER BY name COLLATE NOCASE"),
    );
  }

  find(id: string): Skill | null {
    return (
      this.#hydrate(this.#db.all<SkillRow>("SELECT * FROM skills WHERE id = ?", id))[0] ?? null
    );
  }

  get(id: string): Skill {
    const skill = this.find(id);
    if (!skill) throw notFound(`Skill not found: ${id}`);
    return skill;
  }

  findByLibraryPath(libraryPath: string): Skill | null {
    const rows = this.#db.all<SkillRow>("SELECT * FROM skills WHERE library_path = ?", libraryPath);
    return this.#hydrate(rows)[0] ?? null;
  }

  findByName(name: string): Skill[] {
    return this.#hydrate(
      this.#db.all<SkillRow>("SELECT * FROM skills WHERE name = ? COLLATE NOCASE", name),
    );
  }

  /** Resolve a CLI-style reference: id, exact name, or library folder name. */
  resolve(reference: string): Skill {
    const byId = this.find(reference);
    if (byId) return byId;
    const matches = this.list().filter(
      (s) => s.name.toLowerCase() === reference.toLowerCase() || s.dirName === reference,
    );
    if (matches.length === 1 && matches[0]) return matches[0];
    if (matches.length > 1) throw notFound(`Several skills are called "${reference}". Use the id`);
    throw notFound(`Skill not found: ${reference}`);
  }

  findBySource(sourceType: SourceType, sourceRef: string): Skill | null {
    const rows = this.#db.all<SkillRow>(
      "SELECT * FROM skills WHERE source_type = ? AND source_ref = ?",
      sourceType,
      sourceRef,
    );
    return this.#hydrate(rows)[0] ?? null;
  }

  insert(input: NewSkill): Skill {
    const now = Date.now();
    const id = input.id ?? randomUUID();
    this.#db.run(
      `INSERT INTO skills(id, name, description, source_type, source_ref, source_url, source_subpath,
        source_branch, source_revision, remote_revision, library_path, content_hash, update_status,
        last_checked_at, created_at, updated_at, edited_files, authored, suggest_for, blocked_agents,
        note, favorited_at, source_trusted_host)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.name,
      input.description,
      input.sourceType,
      input.sourceRef ?? null,
      input.sourceUrl ?? null,
      input.sourceSubpath ?? null,
      input.sourceBranch ?? null,
      input.sourceRevision ?? null,
      input.remoteRevision ?? null,
      input.libraryPath,
      input.contentHash,
      input.updateStatus,
      now,
      input.createdAt ?? now,
      input.updatedAt ?? now,
      encodeList(input.editedFiles),
      input.authored ? 1 : 0,
      encodeList(input.suggestFor),
      encodeList(input.blockedAgents),
      input.note ?? null,
      input.favoritedAt ?? null,
      input.sourceTrustedHost ?? null,
    );
    return this.get(id);
  }

  /** `updatedAt` moves only on an edit (see `EDIT_FIELDS`), unless the patch sets it. */
  update(id: string, patch: SkillPatch): Skill {
    const edit = patch.updatedAt === undefined && this.#edits(id, patch);
    const stamped = edit ? { updatedAt: Date.now(), ...patch } : patch;
    const entries = Object.entries(stamped) as [keyof SkillPatch, unknown][];
    if (entries.length === 0) return this.get(id);
    const assignments = entries.map(([key]) => `${PATCH_COLUMNS[key]} = ?`).join(", ");
    const values = entries.map(([key, value]) => {
      if (LIST_COLUMNS.has(key)) return encodeList(value as string[] | null);
      if (typeof value === "boolean") return value ? 1 : 0;
      return (value ?? null) as string | number | null;
    });
    this.#db.run(`UPDATE skills SET ${assignments} WHERE id = ?`, ...values, id);
    return this.get(id);
  }

  /** The patch changes what the skill says or holds, not only how it is kept. */
  #edits(id: string, patch: SkillPatch): boolean {
    const touched = EDIT_FIELDS.filter((key) => key in patch);
    if (touched.length === 0) return false;
    const row = this.#db.get<Record<string, unknown>>(
      `SELECT ${touched.map((key) => PATCH_COLUMNS[key]).join(", ")} FROM skills WHERE id = ?`,
      id,
    );
    return touched.some((key) => (patch[key] ?? null) !== (row?.[PATCH_COLUMNS[key]] ?? null));
  }

  delete(id: string): void {
    this.#db.transaction(() => {
      this.#db.run("DELETE FROM backup_conflicts WHERE skill_key = ?", id);
      this.#db.run("DELETE FROM skills WHERE id = ?", id);
    });
  }

  // ── Folders gone missing ──

  /** Skill id → when a re-index first found its folder missing. */
  missingSince(): Map<string, number> {
    const rows = this.#db.all<{ id: string; missing_since: number }>(
      "SELECT id, missing_since FROM skills WHERE missing_since IS NOT NULL",
    );
    return new Map(rows.map((row) => [row.id, row.missing_since]));
  }

  /** Null: the folder is back. */
  setMissingSince(id: string, at: number | null): void {
    this.#db.run("UPDATE skills SET missing_since = ? WHERE id = ?", at, id);
  }

  // ── Content fingerprints ──

  /** Skill id → its recorded `"<fingerprint>:<hash>"` (see the migration that added it). */
  fingerprints(): Map<string, string> {
    const rows = this.#db.all<{ id: string; content_fingerprint: string }>(
      "SELECT id, content_fingerprint FROM skills WHERE content_fingerprint IS NOT NULL",
    );
    return new Map(rows.map((row) => [row.id, row.content_fingerprint]));
  }

  setFingerprint(id: string, value: string | null): void {
    this.#db.run("UPDATE skills SET content_fingerprint = ? WHERE id = ?", value, id);
  }

  // ── What came from the source ──

  /**
   * Record what a skill holds right after it came from its source (install, update, re-import):
   * later differences are edits. Null for skills installed before this was kept.
   */
  setInstalled(id: string, snapshot: InstalledSnapshot): void {
    this.#db.run(
      "UPDATE skills SET installed_hash = ?, installed_files = ? WHERE id = ?",
      snapshot.hash,
      JSON.stringify(snapshot.files),
      id,
    );
  }

  installed(id: string): InstalledSnapshot | null {
    const row = this.#db.get<{ installed_hash: string | null; installed_files: string | null }>(
      "SELECT installed_hash, installed_files FROM skills WHERE id = ?",
      id,
    );
    if (!row?.installed_hash || !row.installed_files) return null;
    try {
      const files: unknown = JSON.parse(row.installed_files);
      if (typeof files !== "object" || files === null || Array.isArray(files)) return null;
      const entries = Object.entries(files).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      );
      return { hash: row.installed_hash, files: Object.fromEntries(entries) };
    } catch {
      return null;
    }
  }

  // ── Tags ──

  allTags(): string[] {
    return this.#db
      .all<{ tag: string }>("SELECT DISTINCT tag FROM skill_tags ORDER BY tag COLLATE NOCASE")
      .map((r) => r.tag);
  }

  setTags(skillId: string, tags: string[]): void {
    const clean = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
    this.#db.transaction(() => {
      this.#db.run("DELETE FROM skill_tags WHERE skill_id = ?", skillId);
      for (const tag of clean) {
        this.#db.run("INSERT INTO skill_tags(skill_id, tag) VALUES(?, ?)", skillId, tag);
      }
    });
  }

  /** Rename everywhere. A skill that already carries the new name ends up with one copy. */
  renameTag(from: string, to: string): void {
    this.#db.transaction(() => {
      this.#db.run("UPDATE OR IGNORE skill_tags SET tag = ? WHERE tag = ?", to, from);
      this.#db.run("DELETE FROM skill_tags WHERE tag = ?", from);
    });
  }

  deleteTag(tag: string): void {
    this.#db.run("DELETE FROM skill_tags WHERE tag = ?", tag);
  }

  // ── Deployments ──

  deployments(): DeploymentRecord[] {
    return this.#db.all<DeploymentRow>("SELECT * FROM deployments").map(toDeployment);
  }

  deployment(skillId: string, agentKey: string): DeploymentRecord | null {
    const row = this.#db.get<DeploymentRow>(
      "SELECT * FROM deployments WHERE skill_id = ? AND agent_key = ?",
      skillId,
      agentKey,
    );
    return row ? toDeployment(row) : null;
  }

  deploymentsForAgent(agentKey: string): DeploymentRecord[] {
    return this.#db
      .all<DeploymentRow>("SELECT * FROM deployments WHERE agent_key = ?", agentKey)
      .map(toDeployment);
  }

  upsertDeployment(
    skillId: string,
    agentKey: string,
    targetPath: string,
    mode: DeployMode,
    sourceHash: string | null,
  ): void {
    this.#db.run(
      `INSERT INTO deployments(id, skill_id, agent_key, target_path, mode, source_hash, synced_at)
       VALUES(?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(skill_id, agent_key) DO UPDATE SET
         target_path = excluded.target_path, mode = excluded.mode,
         source_hash = excluded.source_hash, synced_at = excluded.synced_at`,
      randomUUID(),
      skillId,
      agentKey,
      targetPath,
      mode,
      sourceHash,
      Date.now(),
    );
  }

  deleteDeployment(skillId: string, agentKey: string): void {
    this.#db.run("DELETE FROM deployments WHERE skill_id = ? AND agent_key = ?", skillId, agentKey);
  }
}
