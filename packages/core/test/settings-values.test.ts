import { join } from "node:path";
import { isNewerVersion } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Database, type Param, type Row } from "../src/db/database";
import { MIGRATIONS } from "../src/db/schema";
import { INTERNAL_KEYS, SettingsStore } from "../src/settings/store";
import { type TestWorld, createTestWorld, databaseAt, tempDir } from "./helpers";

describe("setting values", () => {
  let world: TestWorld;
  beforeEach(() => {
    world = createTestWorld();
  });
  afterEach(() => world.cleanup());

  it("refuses values a setting does not take, and reads a stored bad one as the default", () => {
    const { settings } = world.ctx;
    expect(() => settings.set("deployMode", "foo" as "copy")).toThrow(/symlink, copy/);
    expect(() => settings.set("autoUpdateInterval", "5m" as "1h")).toThrow();
    settings.set("deployMode", "copy");
    expect(settings.get("deployMode")).toBe("copy");

    settings.setRaw("autoUpdateInterval", "5m");
    expect(settings.get("autoUpdateInterval")).toBe("off");
  });
});

describe("settings that became app state", () => {
  it("keep their saved answers under core's own keys", () => {
    const temp = tempDir();
    const path = join(temp.dir, "loadout.db");
    // As a database from before the move: the move runs on the next open.
    const move = MIGRATIONS.findIndex((sql) => sql.includes("'backupFirstRunPrompt'"));
    const old = databaseAt(path, move);
    const saved: Record<string, string> = {
      autoUpdateLastRunAt: "1700000000000",
      backupLastAutoError: '"Could not reach the backup remote."',
      backupFirstRunPrompt: '"restored"',
      agentControlPrompt: '"dismissed"',
    };
    for (const [key, value] of Object.entries(saved)) {
      old.prepare("INSERT INTO settings(key, value) VALUES(?, ?)").run(key, value);
    }
    old.close();

    const db = new Database(path);
    const settings = new SettingsStore(db);
    expect(settings.getRaw(INTERNAL_KEYS.autoUpdateLastRunAt, 0)).toBe(1_700_000_000_000);
    expect(settings.getRaw(INTERNAL_KEYS.backupLastAutoError, "")).toBe(
      "Could not reach the backup remote.",
    );
    expect(settings.getRaw(INTERNAL_KEYS.backupFirstRunAnswered, false)).toBe(true);
    expect(settings.getRaw(INTERNAL_KEYS.agentControlDismissed, false)).toBe(true);
    for (const key of Object.keys(saved)) expect(settings.getRaw(key, null)).toBeNull();
    db.close();
    temp.cleanup();
  });
});

describe("opening a library another process is upgrading", () => {
  it("skips a migration that process applied after this one looked", () => {
    const temp = tempDir();
    const path = join(temp.dir, "loadout.db");
    databaseAt(path, MIGRATIONS.length - 1).close();
    let raced = false;
    class RacingDatabase extends Database {
      override get<T = Row>(sql: string, ...params: Param[]): T | undefined {
        const value = super.get<T>(sql, ...params);
        if (!raced && sql === "PRAGMA user_version") {
          raced = true;
          // The other process upgrades the library right after this one read its version.
          new Database(path).close();
        }
        return value;
      }
    }
    try {
      const db = new RacingDatabase(path);
      expect(raced).toBe(true);
      expect(db.get<{ user_version: number }>("PRAGMA user_version")?.user_version).toBe(
        MIGRATIONS.length,
      );
      db.close();
    } finally {
      temp.cleanup();
    }
  });
});

describe("version order", () => {
  it("puts a pre-release before its release", () => {
    expect(isNewerVersion("1.2.3-rc.1", "1.2.3")).toBe(false);
    expect(isNewerVersion("1.2.3", "1.2.3-rc.1")).toBe(true);
    expect(isNewerVersion("1.2.3-rc.2", "1.2.3-rc.1")).toBe(true);
    expect(isNewerVersion("1.2.3-rc.10", "1.2.3-rc.9")).toBe(true);
    expect(isNewerVersion("1.2.4-beta", "1.2.3")).toBe(true);
    expect(isNewerVersion("v0.2.1", "0.2.0")).toBe(true);
    expect(isNewerVersion("0.2.1", "0.2.1")).toBe(false);
  });
});
