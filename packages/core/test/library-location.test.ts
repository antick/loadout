import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type LibraryPaths, resolveLibrary, setLibraryPath } from "../src/paths";
import { tempDir, writeFile } from "./helpers";

let temp: { dir: string; cleanup: () => void };
let home: string;
let configDir: string;

beforeEach(() => {
  temp = tempDir();
  home = join(temp.dir, "home");
  configDir = join(temp.dir, "config");
  mkdirSync(home, { recursive: true });
});
afterEach(() => temp.cleanup());

const resolve = () => resolveLibrary({ homeDir: home, configDir });
const homeDir = () => join(home, ".loadout");

/** A library with a skill, a database, history and the home folder's own files. */
function seedDefaultLibrary(): LibraryPaths {
  const { paths } = resolve();
  writeFile(join(paths.skillsDir, "alpha", "SKILL.md"), "# alpha\n");
  writeFile(paths.dbPath, "db");
  writeFile(join(paths.historyDir, "alpha", "v1"), "old");
  writeFile(join(paths.binDir, "loadout"), "#!/bin/sh\n");
  writeFile(join(homeDir(), "app", "window-state.json"), "{}");
  return paths;
}

describe("library location", () => {
  it("keeps the location file in the home data folder", () => {
    const paths = seedDefaultLibrary();
    setLibraryPath(paths, join(temp.dir, "elsewhere"));
    expect(existsSync(join(homeDir(), "library.json"))).toBe(true);
  });

  it("moves only the library, and the home folder keeps its own files", () => {
    const target = join(temp.dir, "elsewhere");
    setLibraryPath(seedDefaultLibrary(), target);

    const { paths, warnings } = resolve();
    expect(warnings).toEqual([]);
    expect(paths.baseDir).toBe(target);
    expect(readFileSync(join(target, "skills", "alpha", "SKILL.md"), "utf8")).toBe("# alpha\n");
    expect(existsSync(join(target, "history", "alpha", "v1"))).toBe(true);
    expect(existsSync(join(homeDir(), "skills"))).toBe(false);
    expect(existsSync(join(homeDir(), "bin", "loadout"))).toBe(true);
    expect(existsSync(join(homeDir(), "app", "window-state.json"))).toBe(true);
    expect(existsSync(join(target, "bin"))).toBe(false);
  });

  it("moves back into the home folder although it is not empty", () => {
    const target = join(temp.dir, "elsewhere");
    setLibraryPath(seedDefaultLibrary(), target);
    const moved = resolve().paths;

    setLibraryPath(moved, null);
    const { paths, warnings } = resolve();
    expect(warnings).toEqual([]);
    expect(paths.baseDir).toBe(homeDir());
    expect(existsSync(join(homeDir(), "skills", "alpha", "SKILL.md"))).toBe(true);
    // The custom folder was ours and is empty now.
    expect(existsSync(target)).toBe(false);
  });

  it("refuses a folder that already holds something else", () => {
    const target = join(temp.dir, "documents");
    writeFile(join(target, "taxes.pdf"), "private");
    setLibraryPath(seedDefaultLibrary(), target);

    const { paths, warnings } = resolve();
    expect(warnings).toContain("migration_incomplete");
    expect(paths.baseDir).toBe(homeDir());
    expect(existsSync(join(homeDir(), "skills", "alpha"))).toBe(true);
    expect(existsSync(join(target, "skills"))).toBe(false);
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "puts everything back when the move fails halfway",
    () => {
      const paths = seedDefaultLibrary();
      const parent = join(temp.dir, "locked");
      mkdirSync(parent);
      const target = join(parent, "library");
      setLibraryPath(paths, target);
      chmodSync(parent, 0o500);
      try {
        const { paths: after, warnings } = resolve();
        expect(warnings).toContain("migration_incomplete");
        expect(after.baseDir).toBe(homeDir());
        expect(existsSync(join(homeDir(), "skills", "alpha", "SKILL.md"))).toBe(true);
        expect(existsSync(join(homeDir(), "loadout.db"))).toBe(true);
      } finally {
        chmodSync(parent, 0o700);
      }
    },
  );

  it("adopts the location file older versions kept in the OS config folder", () => {
    const target = join(temp.dir, "custom");
    mkdirSync(join(target, "skills"), { recursive: true });
    const legacy = join(configDir, "loadout", "library.json");
    writeFile(legacy, JSON.stringify({ libraryPath: target, pendingMigrationFrom: null }));

    const { paths } = resolve();
    expect(paths.baseDir).toBe(target);
    expect(existsSync(legacy)).toBe(false);
    expect(existsSync(join(configDir, "loadout"))).toBe(false);
    expect(existsSync(join(homeDir(), "library.json"))).toBe(true);
  });

  it("never lets an old location file replace the current one", () => {
    const legacy = join(configDir, "loadout", "library.json");
    writeFile(
      legacy,
      JSON.stringify({ libraryPath: join(temp.dir, "old"), pendingMigrationFrom: null }),
    );
    writeFile(join(homeDir(), "library.json"), JSON.stringify({ libraryPath: null }));

    expect(resolve().paths.baseDir).toBe(homeDir());
    expect(existsSync(legacy)).toBe(true);
  });
});
