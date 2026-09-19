import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCore, silentLogger } from "@skillboard/core";
import { LIBRARY_DIR_NAME } from "@skillboard/shared";
import { EXIT_OK, runCli } from "../src/run";

export const VERSION = "9.9.9-test";
export const AGENT = "claude_code";
export const AGENT_DIR = ".claude";

export interface Run {
  code: number;
  stdout: string;
  stderr: string;
  /** Parsed stdout (or stderr for failures) of a `--json` run. */
  json<T = Record<string, unknown>>(): T;
}

/** A throwaway home with one installed agent; commands run in-process against the real core. */
export interface Sandbox {
  root: string;
  home: string;
  libraryDir: string;
  agentSkillsDir: string;
  cli(...argv: string[]): Promise<Run>;
  cleanup(): void;
}

export function createSandbox(): Sandbox {
  const root = mkdtempSync(join(tmpdir(), "cli-test-"));
  const home = join(root, "home");
  mkdirSync(join(home, AGENT_DIR), { recursive: true });

  async function cli(...argv: string[]): Promise<Run> {
    let stdout = "";
    let stderr = "";
    const code = await runCli(argv, {
      createCore,
      io: { stdout: (text) => (stdout += text), stderr: (text) => (stderr += text) },
      version: VERSION,
      cwd: root,
      homeDir: home,
      coreOptions: { homeDir: home, configDir: join(root, "config"), logger: silentLogger },
    });
    return {
      code,
      stdout,
      stderr,
      json: () => JSON.parse(code === EXIT_OK ? stdout : stderr || stdout),
    };
  }

  return {
    root,
    home,
    libraryDir: join(home, LIBRARY_DIR_NAME, "skills"),
    agentSkillsDir: join(home, AGENT_DIR, "skills"),
    cli,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

export function writeSkill(parent: string, name: string, body = `# ${name}\n`): string {
  const dir = join(parent, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: Test ${name}\n---\n\n${body}`,
  );
  return dir;
}
