import type { BackupConflict } from "@loadout/shared";
import type { Database } from "../db/database";

/** Rows of `backup_conflicts`: skills waiting for the user to pick a side after a merge. */

interface ConflictRow {
  skill_key: string;
  skill_name: string;
  theirs_commit: string;
  theirs_path: string | null;
  detected_at: number;
}

function toConflict(row: ConflictRow): BackupConflict {
  return {
    skillKey: row.skill_key,
    skillName: row.skill_name,
    theirsCommit: row.theirs_commit,
    theirsPath: row.theirs_path,
    detectedAt: row.detected_at,
  };
}

export function listConflicts(db: Database): BackupConflict[] {
  return db
    .all<ConflictRow>("SELECT * FROM backup_conflicts ORDER BY detected_at, skill_name")
    .map(toConflict);
}

export function findConflict(db: Database, skillKey: string): BackupConflict | null {
  const row = db.get<ConflictRow>("SELECT * FROM backup_conflicts WHERE skill_key = ?", skillKey);
  return row ? toConflict(row) : null;
}

export function countConflicts(db: Database): number {
  return Number(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM backup_conflicts")?.n ?? 0);
}

/**
 * Record a conflict. When the skill is already waiting, only the remote version it points at
 * moves forward; the date it was first noticed stays. Returns true for a new conflict.
 */
export function recordConflict(
  db: Database,
  conflict: Omit<BackupConflict, "detectedAt">,
): boolean {
  const isNew = findConflict(db, conflict.skillKey) === null;
  db.run(
    `INSERT INTO backup_conflicts(skill_key, skill_name, theirs_commit, theirs_path, detected_at)
     VALUES(?, ?, ?, ?, ?)
     ON CONFLICT(skill_key) DO UPDATE SET skill_name = excluded.skill_name,
       theirs_commit = excluded.theirs_commit, theirs_path = excluded.theirs_path`,
    conflict.skillKey,
    conflict.skillName,
    conflict.theirsCommit,
    conflict.theirsPath,
    Date.now(),
  );
  return isNew;
}

export function deleteConflict(db: Database, skillKey: string): void {
  db.run("DELETE FROM backup_conflicts WHERE skill_key = ?", skillKey);
}
