import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { AppError } from "../errors";
import { MIGRATIONS } from "./schema";

export type Row = Record<string, unknown>;
export type Param = SQLInputValue;

const BUSY_TIMEOUT_MS = 5000;

/** Thin convenience layer over the built-in SQLite driver. Synchronous by design. */
export class Database {
  readonly #db: DatabaseSync;

  constructor(path: string) {
    this.#db = new DatabaseSync(path);
    this.#db.exec(`PRAGMA journal_mode = WAL`);
    this.#db.exec(`PRAGMA foreign_keys = ON`);
    this.#db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
    this.#migrate();
  }

  #migrate(): void {
    const current = Number(
      this.get<{ user_version: number }>("PRAGMA user_version")?.user_version ?? 0,
    );
    if (current > MIGRATIONS.length) {
      throw new AppError(
        "UNSUPPORTED",
        "This library was created by a newer version of the app than this one supports.",
      );
    }
    for (let version = current; version < MIGRATIONS.length; version += 1) {
      const sql = MIGRATIONS[version];
      if (!sql) continue;
      this.transaction(() => {
        this.#db.exec(sql);
        this.#db.exec(`PRAGMA user_version = ${version + 1}`);
      });
    }
  }

  all<T = Row>(sql: string, ...params: Param[]): T[] {
    return this.#db.prepare(sql).all(...params) as T[];
  }

  get<T = Row>(sql: string, ...params: Param[]): T | undefined {
    return this.#db.prepare(sql).get(...params) as T | undefined;
  }

  run(sql: string, ...params: Param[]): number {
    return Number(this.#db.prepare(sql).run(...params).changes);
  }

  exec(sql: string): void {
    this.#db.exec(sql);
  }

  /** Run `fn` atomically. Nested calls join the outer transaction. */
  transaction<T>(fn: () => T): T {
    if (this.#db.isTransaction) return fn();
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.#db.exec("COMMIT");
      return result;
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  /** Safe to call twice: a library abandoned mid-run is closed again on the way out. */
  close(): void {
    if (this.#db.isOpen) this.#db.close();
  }
}
