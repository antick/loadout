import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type ContextBundle, createContext } from "../src/create-context";
import { silentLogger } from "../src/log";

/** A throwaway folder, removed by the returned cleanup. */
export function tempDir(prefix = "skillboard-test-"): { dir: string; cleanup: () => void } {
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
    configDir: join(temp.dir, "config"),
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
