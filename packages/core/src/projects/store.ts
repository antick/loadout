import { randomUUID } from "node:crypto";
import type { WorkspaceType } from "@skillboard/shared";
import type { Database } from "../db/database";
import { notFound } from "../errors";

interface ProjectRow {
  id: string;
  name: string;
  path: string;
  type: string;
  linked_agent_key: string | null;
  disabled_path: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

/** A saved workspace as stored; everything read from disk is added by the service. */
export interface ProjectRecord {
  id: string;
  name: string;
  /** Project root, or the skills root itself for a linked workspace. */
  path: string;
  type: WorkspaceType;
  /** Linked workspaces only: key of the stand-in agent their skills are listed under. */
  linkedAgentKey: string | null;
  /** Linked workspaces only: where switched-off skills are parked. Null = cannot switch off. */
  disabledPath: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export type NewProject = Pick<
  ProjectRecord,
  "name" | "path" | "type" | "linkedAgentKey" | "disabledPath"
>;

function toRecord(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    type: row.type === "linked" ? "linked" : "project",
    linkedAgentKey: row.linked_agent_key,
    disabledPath: row.disabled_path,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** All SQL for saved project and linked workspaces. */
export class ProjectStore {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  list(): ProjectRecord[] {
    return this.#db
      .all<ProjectRow>("SELECT * FROM projects ORDER BY sort_order, created_at")
      .map(toRecord);
  }

  find(id: string): ProjectRecord | null {
    const row = this.#db.get<ProjectRow>("SELECT * FROM projects WHERE id = ?", id);
    return row ? toRecord(row) : null;
  }

  get(id: string): ProjectRecord {
    const project = this.find(id);
    if (!project) throw notFound(`Project not found: ${id}`);
    return project;
  }

  /** New workspaces go to the end of the list. */
  insert(input: NewProject): ProjectRecord {
    const id = randomUUID();
    const now = Date.now();
    const next = this.#db.get<{ next: number | null }>(
      "SELECT MAX(sort_order) + 1 AS next FROM projects",
    );
    this.#db.run(
      `INSERT INTO projects(id, name, path, type, linked_agent_key, disabled_path, sort_order,
        created_at, updated_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.name,
      input.path,
      input.type,
      input.linkedAgentKey,
      input.disabledPath,
      next?.next ?? 0,
      now,
      now,
    );
    return this.get(id);
  }

  delete(id: string): void {
    this.#db.run("DELETE FROM projects WHERE id = ?", id);
  }

  reorder(ids: string[]): void {
    this.#db.transaction(() => {
      ids.forEach((id, index) => {
        this.#db.run("UPDATE projects SET sort_order = ? WHERE id = ?", index, id);
      });
    });
  }
}
