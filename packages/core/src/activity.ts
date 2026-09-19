import type { ActivityEntry, ActivityKind } from "@skillboard/shared";
import type { Database } from "./db/database";

const DEFAULT_LIMIT = 50;
const KEEP_ROWS = 2000;

interface ActivityRow {
  id: number;
  at: number;
  kind: string;
  subject: string;
  detail: string | null;
  ok: number;
}

/** Best-effort local history of what was installed, removed, updated and deployed. */
export class ActivityLog {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  record(kind: ActivityKind, subject: string, detail: string | null = null, ok = true): void {
    try {
      this.#db.run(
        "INSERT INTO activity(at, kind, subject, detail, ok) VALUES(?, ?, ?, ?, ?)",
        Date.now(),
        kind,
        subject,
        detail,
        ok ? 1 : 0,
      );
      this.#db.run(
        "DELETE FROM activity WHERE id <= (SELECT MAX(id) FROM activity) - ?",
        KEEP_ROWS,
      );
    } catch {
      // History is a convenience; never fail the operation it describes.
    }
  }

  list(limit = DEFAULT_LIMIT): ActivityEntry[] {
    return this.#db
      .all<ActivityRow>("SELECT * FROM activity ORDER BY id DESC LIMIT ?", limit)
      .map((row) => ({
        id: String(row.id),
        kind: row.kind as ActivityKind,
        subject: row.subject,
        detail: row.detail,
        ok: row.ok === 1,
        at: row.at,
      }));
  }
}
