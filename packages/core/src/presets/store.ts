import { randomUUID } from "node:crypto";
import type { Preset } from "@loadout/shared";
import type { Database } from "../db/database";
import { notFound } from "../errors";

interface PresetRow {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface PresetFields {
  name: string;
  description: string | null;
  icon: string | null;
}

const PRESET_ORDER = "ORDER BY sort_order, created_at";
const SKILL_ORDER = "ORDER BY sort_order, added_at";

/** All SQL for presets, their skills and the per-skill per-agent switches. No filesystem work. */
export class PresetStore {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  #hydrate(row: PresetRow): Preset {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      icon: row.icon,
      sortOrder: row.sort_order,
      skillIds: this.skillIds(row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  list(): Preset[] {
    return this.#db
      .all<PresetRow>(`SELECT * FROM presets ${PRESET_ORDER}`)
      .map((row) => this.#hydrate(row));
  }

  find(id: string): Preset | null {
    const row = this.#db.get<PresetRow>("SELECT * FROM presets WHERE id = ?", id);
    return row ? this.#hydrate(row) : null;
  }

  get(id: string): Preset {
    const preset = this.find(id);
    if (!preset) throw notFound(`Preset not found: ${id}`);
    return preset;
  }

  /** Names are compared the way the UNIQUE column compares them: exactly. */
  findByName(name: string): Preset | null {
    const row = this.#db.get<PresetRow>("SELECT * FROM presets WHERE name = ?", name);
    return row ? this.#hydrate(row) : null;
  }

  /** One past the largest order in `table`, so whatever is added next sorts last. */
  #nextOrder(table: "presets" | "preset_skills", where = "", ...params: string[]): number {
    const row = this.#db.get<{ next: number | null }>(
      `SELECT MAX(sort_order) + 1 AS next FROM ${table} ${where}`,
      ...params,
    );
    return row?.next ?? 0;
  }

  insert(fields: PresetFields): Preset {
    const id = randomUUID();
    const now = Date.now();
    this.#db.run(
      `INSERT INTO presets(id, name, description, icon, sort_order, created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?)`,
      id,
      fields.name,
      fields.description,
      fields.icon,
      this.#nextOrder("presets"),
      now,
      now,
    );
    return this.get(id);
  }

  update(id: string, fields: PresetFields): Preset {
    this.#db.run(
      "UPDATE presets SET name = ?, description = ?, icon = ?, updated_at = ? WHERE id = ?",
      fields.name,
      fields.description,
      fields.icon,
      Date.now(),
      id,
    );
    return this.get(id);
  }

  delete(id: string): void {
    this.#db.run("DELETE FROM presets WHERE id = ?", id);
  }

  #touch(id: string): void {
    this.#db.run("UPDATE presets SET updated_at = ? WHERE id = ?", Date.now(), id);
  }

  /** Ids not listed keep their place after the listed ones. */
  reorder(ids: string[]): void {
    this.#db.transaction(() => {
      ids.forEach((id, index) => {
        this.#db.run("UPDATE presets SET sort_order = ? WHERE id = ?", index, id);
      });
    });
  }

  skillIds(presetId: string): string[] {
    return this.#db
      .all<{ skill_id: string }>(
        `SELECT skill_id FROM preset_skills WHERE preset_id = ? ${SKILL_ORDER}`,
        presetId,
      )
      .map((row) => row.skill_id);
  }

  hasSkill(presetId: string, skillId: string): boolean {
    return (
      this.#db.get(
        "SELECT 1 AS found FROM preset_skills WHERE preset_id = ? AND skill_id = ?",
        presetId,
        skillId,
      ) !== undefined
    );
  }

  /** Skills already in the preset keep their place; new ones go to the end in the given order. */
  addSkills(presetId: string, skillIds: string[]): void {
    this.#db.transaction(() => {
      let order = this.#nextOrder("preset_skills", "WHERE preset_id = ?", presetId);
      for (const skillId of skillIds) {
        const added = this.#db.run(
          `INSERT OR IGNORE INTO preset_skills(preset_id, skill_id, sort_order, added_at)
           VALUES(?, ?, ?, ?)`,
          presetId,
          skillId,
          order,
          Date.now(),
        );
        order += added;
      }
      this.#touch(presetId);
    });
  }

  /** The skill's agent switches go with it, so adding it back later starts from "all on". */
  removeSkills(presetId: string, skillIds: string[]): void {
    this.#db.transaction(() => {
      for (const skillId of skillIds) {
        this.#db.run(
          "DELETE FROM preset_skills WHERE preset_id = ? AND skill_id = ?",
          presetId,
          skillId,
        );
        this.#db.run(
          "DELETE FROM preset_skill_agents WHERE preset_id = ? AND skill_id = ?",
          presetId,
          skillId,
        );
      }
      this.#touch(presetId);
    });
  }

  reorderSkills(presetId: string, skillIds: string[]): void {
    this.#db.transaction(() => {
      skillIds.forEach((skillId, index) => {
        this.#db.run(
          "UPDATE preset_skills SET sort_order = ? WHERE preset_id = ? AND skill_id = ?",
          index,
          presetId,
          skillId,
        );
      });
      this.#touch(presetId);
    });
  }

  /** Agents switched off for one skill of a preset. Everything not listed is on. */
  disabledAgents(presetId: string, skillId: string): Set<string> {
    const rows = this.#db.all<{ agent_key: string }>(
      "SELECT agent_key FROM preset_skill_agents WHERE preset_id = ? AND skill_id = ? AND enabled = 0",
      presetId,
      skillId,
    );
    return new Set(rows.map((row) => row.agent_key));
  }

  setToggle(presetId: string, skillId: string, agentKey: string, enabled: boolean): void {
    this.#db.run(
      `INSERT INTO preset_skill_agents(preset_id, skill_id, agent_key, enabled, updated_at)
       VALUES(?, ?, ?, ?, ?)
       ON CONFLICT(preset_id, skill_id, agent_key) DO UPDATE SET
         enabled = excluded.enabled, updated_at = excluded.updated_at`,
      presetId,
      skillId,
      agentKey,
      enabled ? 1 : 0,
      Date.now(),
    );
    this.#touch(presetId);
  }
}
