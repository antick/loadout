import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect } from "vitest";
import { type Core, type CoreCreateOptions, createCore } from "../src/core";
import { type ContextBundle, createContext } from "../src/create-context";
import { MIGRATIONS } from "../src/db/schema";
import { AppError } from "../src/errors";
import type { SafetyGate } from "../src/install/safety-gate";
import { silentLogger } from "../src/log";

/** A throwaway folder, removed by the returned cleanup. */
export function tempDir(prefix = "loadout-test-"): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

/** Create a minimal valid skill folder and return its path. */
export function makeSkill(
  parent: string,
  dirName: string,
  options: {
    name?: string;
    description?: string;
    body?: string;
    files?: Record<string, string>;
  } = {},
): string {
  const dir = join(parent, dirName);
  const name = options.name ?? dirName;
  const description = options.description ?? `Test skill ${dirName}`;
  writeFile(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n${options.body ?? `# ${name}\n`}`,
  );
  for (const [relative, content] of Object.entries(options.files ?? {})) {
    writeFile(join(dir, relative), content);
  }
  return dir;
}

export interface TestWorld extends ContextBundle {
  /** Fake home directory; agent folders live under it. */
  home: string;
  /** Library base folder. */
  base: string;
  root: string;
  cleanup(): void;
}

/** A complete isolated library + home directory for service tests. */
export function createTestWorld(): TestWorld {
  const temp = tempDir();
  const home = join(temp.dir, "home");
  const base = join(home, ".library");
  mkdirSync(home, { recursive: true });
  const bundle = createContext({
    homeDir: home,
    baseDir: base,
    logger: silentLogger,
  });
  return {
    ...bundle,
    home,
    base,
    root: temp.dir,
    cleanup: () => {
      bundle.close();
      temp.cleanup();
    },
  };
}

/** A safety check that passes everything, for services in tests that are not about safety. */
export const passingSafety: SafetyGate = {
  check: async (candidates) => candidates.map(() => null),
  remember: () => undefined,
};

/** The `AppError` a promise rejects with; fails the test when it resolves or throws anything else. */
export async function rejection(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

/**
 * A core for a test: quiet, without the safety scanner, its settings in `<homeDir>/config` unless
 * the test says otherwise.
 */
export function createTestCore(options: CoreCreateOptions & { homeDir: string }): Core {
  return createCore({
    logger: silentLogger,
    safetyScannerPath: null,
    ...options,
  });
}

/** A database as an older app left it: only the first `version` migrations applied. */
export function databaseAt(path: string, version: number): DatabaseSync {
  const db = new DatabaseSync(path);
  for (const sql of MIGRATIONS.slice(0, version)) db.exec(sql);
  db.exec(`PRAGMA user_version = ${version}`);
  return db;
}
