import type { ItemKind } from "@loadout/shared";
import type { Database } from "../db/database";

/** One item file Loadout wrote into an agent's folder, global or in a project. */
export interface ItemDeploymentRecord {
  kind: ItemKind;
  name: string;
  agentKey: string;
  /** Null for the agent's global folder. */
  projectId: string | null;
  targetPath: string;
  /** SHA-256 of the bytes written: a different file there now was edited by someone else. */
  writtenHash: string;
  /** Hash of the library item it was converted from. */
  sourceHash: string;
  syncedAt: number;
}

interface Row {
  kind: ItemKind;
  name: string;
  agent_key: string;
  project_id: string;
  target_path: string;
  written_hash: string;
  source_hash: string;
  synced_at: number;
}

const GLOBAL = "";

function toRecord(row: Row): ItemDeploymentRecord {
  return {
    kind: row.kind,
    name: row.name,
    agentKey: row.agent_key,
    projectId: row.project_id === GLOBAL ? null : row.project_id,
    targetPath: row.target_path,
    writtenHash: row.written_hash,
    sourceHash: row.source_hash,
    syncedAt: row.synced_at,
  };
}

/** All SQL for item deployments. */
export class ItemDeploymentStore {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  list(): ItemDeploymentRecord[] {
    return this.#db.all<Row>("SELECT * FROM item_deployments").map(toRecord);
  }

  forItem(kind: ItemKind, name: string): ItemDeploymentRecord[] {
    return this.#db
      .all<Row>("SELECT * FROM item_deployments WHERE kind = ? AND name = ?", kind, name)
      .map(toRecord);
  }

  find(
    kind: ItemKind,
    name: string,
    agentKey: string,
    projectId: string | null,
  ): ItemDeploymentRecord | null {
    const row = this.#db.get<Row>(
      `SELECT * FROM item_deployments
       WHERE kind = ? AND name = ? AND agent_key = ? AND project_id = ?`,
      kind,
      name,
      agentKey,
      projectId ?? GLOBAL,
    );
    return row ? toRecord(row) : null;
  }

  /** Every record pointing at one file, whatever item it was. */
  atPath(targetPath: string): ItemDeploymentRecord[] {
    return this.#db
      .all<Row>("SELECT * FROM item_deployments WHERE target_path = ?", targetPath)
      .map(toRecord);
  }

  upsert(record: ItemDeploymentRecord): void {
    this.#db.run(
      `INSERT INTO item_deployments(kind, name, agent_key, project_id, target_path, written_hash,
         source_hash, synced_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(kind, name, agent_key, project_id) DO UPDATE SET
         target_path = excluded.target_path, written_hash = excluded.written_hash,
         source_hash = excluded.source_hash, synced_at = excluded.synced_at`,
      record.kind,
      record.name,
      record.agentKey,
      record.projectId ?? GLOBAL,
      record.targetPath,
      record.writtenHash,
      record.sourceHash,
      record.syncedAt,
    );
  }

  delete(kind: ItemKind, name: string, agentKey: string, projectId: string | null): void {
    this.#db.run(
      "DELETE FROM item_deployments WHERE kind = ? AND name = ? AND agent_key = ? AND project_id = ?",
      kind,
      name,
      agentKey,
      projectId ?? GLOBAL,
    );
  }

  /** Records of a project that was unlinked: its files stay, Loadout stops managing them. */
  deleteForProject(projectId: string): void {
    this.#db.run("DELETE FROM item_deployments WHERE project_id = ?", projectId);
  }
}
