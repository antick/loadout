import type { Database } from "../db/database";
import type { UsageEvent } from "./parse";

/** How far one log was read. */
export interface ReadMark {
  size: number;
  mtime: number;
  readTo: number;
  projectPath: string | null;
}

/** Uses of one name (lower case) by one agent. */
export interface NameCount {
  name: string;
  agentKey: string;
  uses: number;
  recentUses: number;
  lastUsedAt: number;
}

/** A project a name was used in, and when last. */
export interface NameProject {
  name: string;
  projectPath: string;
  lastUsedAt: number;
}

/** All SQL for skill usage: the runs found, and how far each log was read. */
export interface UsageStore {
  mark(path: string): ReadMark | null;
  /** Record what one log added and how far it was read, together. */
  save(path: string, agentKey: string, events: readonly UsageEvent[], mark: ReadMark): void;
  counts(recentSince: number): NameCount[];
  projects(): NameProject[];
  clear(): void;
}

export function createUsageStore(db: Database): UsageStore {
  return {
    mark: (path) => {
      const row = db.get<{
        size: number;
        mtime: number;
        read_to: number;
        project_path: string | null;
      }>("SELECT size, mtime, read_to, project_path FROM usage_files WHERE path = ?", path);
      return row
        ? { size: row.size, mtime: row.mtime, readTo: row.read_to, projectPath: row.project_path }
        : null;
    },

    save: (path, agentKey, events, mark) =>
      db.transaction(() => {
        for (const event of events) {
          db.run(
            `INSERT OR IGNORE INTO usage_events(agent_key, event_id, name, used_at, project_path)
             VALUES (?, ?, ?, ?, ?)`,
            agentKey,
            event.eventId,
            event.name,
            event.usedAt,
            event.projectPath,
          );
        }
        db.run(
          `INSERT INTO usage_files(path, size, mtime, read_to, project_path) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(path) DO UPDATE SET size = excluded.size, mtime = excluded.mtime,
             read_to = excluded.read_to, project_path = excluded.project_path`,
          path,
          mark.size,
          mark.mtime,
          mark.readTo,
          mark.projectPath,
        );
      }),

    counts: (recentSince) =>
      db.all<NameCount>(
        `SELECT lower(name) AS name, agent_key AS agentKey, COUNT(*) AS uses,
           SUM(used_at >= ?) AS recentUses, MAX(used_at) AS lastUsedAt
         FROM usage_events GROUP BY lower(name), agent_key`,
        recentSince,
      ),

    projects: () =>
      db.all<NameProject>(
        `SELECT lower(name) AS name, project_path AS projectPath, MAX(used_at) AS lastUsedAt
         FROM usage_events WHERE project_path IS NOT NULL
         GROUP BY lower(name), project_path ORDER BY lastUsedAt DESC`,
      ),

    clear: () =>
      db.transaction(() => {
        db.run("DELETE FROM usage_events");
        db.run("DELETE FROM usage_files");
      }),
  };
}
