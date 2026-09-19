import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import type { DeployMode, Deployment, Skill, SourceType, UpdateStatus } from "@skillboard/shared";
import type { Database } from "../db/database";
import { notFound } from "../errors";

interface SkillRow {
  id: string;
  name: string;
  description: string | null;
  source_type: string;
  source_ref: string | null;
  source_url: string | null;
  source_subpath: string | null;
  source_branch: string | null;
  source_revision: string | null;
  remote_revision: string | null;
  library_path: string;
  content_hash: string | null;
  update_status: string;
  last_checked_at: number | null;
  last_check_error: string | null;
  created_at: number;
  updated_at: number;
}

interface DeploymentRow {
  id: string;
  skill_id: string;
  agent_key: string;
  target_path: string;
  mode: string;
  source_hash: string | null;
  synced_at: number | null;
}

/** A deployment row including the library hash it was last synced from. */
export interface DeploymentRecord extends Deployment {
  sourceHash: string | null;
}

export interface NewSkill {
  id?: string;
  name: string;
  description: string | null;
  sourceType: SourceType;
  sourceRef?: string | null;
  sourceUrl?: string | null;
  sourceSubpath?: string | null;
  sourceBranch?: string | null;
  sourceRevision?: string | null;
  remoteRevision?: string | null;
  libraryPath: string;
  contentHash: string | null;
  updateStatus: UpdateStatus;
  createdAt?: number;
  updatedAt?: number;
}

export type SkillPatch = Partial<
  Pick<
    Skill,
    | "name"
    | "description"
    | "sourceType"
    | "sourceRef"
    | "sourceUrl"
    | "sourceSubpath"
    | "sourceBranch"
    | "sourceRevision"
    | "remoteRevision"
    | "libraryPath"
    | "contentHash"
    | "updateStatus"
    | "lastCheckedAt"
    | "lastCheckError"
    | "updatedAt"
  >
>;

const PATCH_COLUMNS: Record<keyof SkillPatch, string> = {
  name: "name",
  description: "description",
  sourceType: "source_type",
  sourceRef: "source_ref",
  sourceUrl: "source_url",
  sourceSubpath: "source_subpath",
  sourceBranch: "source_branch",
  sourceRevision: "source_revision",
  remoteRevision: "remote_revision",
  libraryPath: "library_path",
  contentHash: "content_hash",
  updateStatus: "update_status",
  lastCheckedAt: "last_checked_at",
  lastCheckError: "last_check_error",
  updatedAt: "updated_at",
};

function toDeployment(row: DeploymentRow): DeploymentRecord {
  return {
    id: row.id,
    skillId: row.skill_id,
    agentKey: row.agent_key,
    targetPath: row.target_path,
    mode: row.mode as DeployMode,
    syncedAt: row.synced_at,
    sourceHash: row.source_hash,
  };
}

/** All reads and writes of skills, tags and deployments. No filesystem work happens here. */
export class SkillStore {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  #hydrate(rows: SkillRow[]): Skill[] {
    if (rows.length === 0) return [];
    const deployments = new Map<string, Deployment[]>();
    for (const row of this.#db.all<DeploymentRow>("SELECT * FROM deployments ORDER BY agent_key")) {
      const { sourceHash: _sourceHash, ...deployment } = toDeployment(row);
      deployments.set(row.skill_id, [...(deployments.get(row.skill_id) ?? []), deployment]);
    }
    const tags = new Map<string, string[]>();
    for (const row of this.#db.all<{ skill_id: string; tag: string }>(
      "SELECT skill_id, tag FROM skill_tags ORDER BY tag",
    )) {
      tags.set(row.skill_id, [...(tags.get(row.skill_id) ?? []), row.tag]);
    }
    const presets = new Map<string, string[]>();
    for (const row of this.#db.all<{ skill_id: string; preset_id: string }>(
      "SELECT skill_id, preset_id FROM preset_skills",
    )) {
      presets.set(row.skill_id, [...(presets.get(row.skill_id) ?? []), row.preset_id]);
    }
    const conflicts = new Set(
      this.#db
        .all<{ skill_key: string }>("SELECT skill_key FROM backup_conflicts")
        .map((r) => r.skill_key),
    );
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      dirName: basename(row.library_path),
      description: row.description,
      sourceType: row.source_type as SourceType,
      sourceRef: row.source_ref,
      sourceUrl: row.source_url,
      sourceSubpath: row.source_subpath,
      sourceBranch: row.source_branch,
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
    }));
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
    if (matches.length > 1) throw notFound(`Several skills are called "${reference}" — use the id`);
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

  findByHash(contentHash: string): Skill[] {
    return this.#hydrate(
      this.#db.all<SkillRow>("SELECT * FROM skills WHERE content_hash = ?", contentHash),
    );
  }

  insert(input: NewSkill): Skill {
    const now = Date.now();
    const id = input.id ?? randomUUID();
    this.#db.run(
      `INSERT INTO skills(id, name, description, source_type, source_ref, source_url, source_subpath,
        source_branch, source_revision, remote_revision, library_path, content_hash, update_status,
        last_checked_at, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    );
    return this.get(id);
  }

  update(id: string, patch: SkillPatch): Skill {
    const entries = Object.entries({ updatedAt: Date.now(), ...patch }) as [
      keyof SkillPatch,
      unknown,
    ][];
    const assignments = entries.map(([key]) => `${PATCH_COLUMNS[key]} = ?`).join(", ");
    const values = entries.map(([, value]) => (value ?? null) as string | number | null);
    this.#db.run(`UPDATE skills SET ${assignments} WHERE id = ?`, ...values, id);
    return this.get(id);
  }

  delete(id: string): void {
    this.#db.transaction(() => {
      this.#db.run("DELETE FROM backup_conflicts WHERE skill_key = ?", id);
      this.#db.run("DELETE FROM skills WHERE id = ?", id);
    });
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
