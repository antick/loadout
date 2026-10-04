import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCore, silentLogger } from "@loadout/core";
import { CLI_BINARY_NAME, LIBRARY_DIR_NAME } from "@loadout/shared";
import { EXIT_FAILED, EXIT_OK, EXIT_USAGE } from "../src/run";
import { type Run, type Sandbox, VERSION, createSandbox, writeSkill } from "./harness";

let sandbox: Sandbox;
let root: string;
let home: string;
const cli = (...argv: string[]): Promise<Run> => sandbox.cli(...argv);

beforeEach(() => {
  sandbox = createSandbox();
  ({ root, home } = sandbox);
});

afterEach(() => sandbox.cleanup());

describe("repo and --library", () => {
  it("shows the library and queues a move", async () => {
    const shown = (await cli("repo", "show", "--json")).json<{
      path: string;
      skillCount: number;
      pendingPath: string | null;
    }>();
    expect(shown).toMatchObject({
      path: join(home, LIBRARY_DIR_NAME),
      skillCount: 0,
      pendingPath: null,
    });

    const target = join(root, "moved");
    expect((await cli("repo", "set", "./moved", "--json")).json()).toMatchObject({
      pendingPath: target,
    });
    // Every run is a start, so the queued move has happened by the time the next command runs.
    expect((await cli("repo", "show", "--json")).json()).toMatchObject({
      path: target,
      pendingPath: null,
      overridden: true,
    });
    expect((await cli("repo", "reset", "--json")).json()).toMatchObject({
      pendingPath: join(home, LIBRARY_DIR_NAME),
    });
    expect((await cli("repo", "show", "--json")).json()).toMatchObject({
      path: join(home, LIBRARY_DIR_NAME),
      pendingPath: null,
    });
    expect((await cli("repo", "set", "--json")).code).toBe(EXIT_USAGE);
  });

  it("fails, and creates nothing, while the saved library's disk is not connected", async () => {
    const away = join(root, "external", "loadout");
    mkdirSync(join(home, LIBRARY_DIR_NAME), { recursive: true });
    writeFileSync(
      join(home, LIBRARY_DIR_NAME, "library.json"),
      JSON.stringify({ libraryPath: away, pendingMigrationFrom: null }),
    );
    const run = await cli("skills", "list", "--json");
    expect(run.code).toBe(EXIT_FAILED);
    expect(run.json()).toMatchObject({ code: "LIBRARY_UNAVAILABLE", details: { path: away } });
    expect(existsSync(away)).toBe(false);
  });

  it("works on another library without touching the saved one", async () => {
    writeSkill(join(root, "src"), "alpha");
    const other = join(root, "other-library");
    // --library opens libraries that exist; a mistyped path never starts an empty one.
    const missing = await cli("--library", other, "skills", "list", "--json");
    expect(missing.code).toBe(EXIT_FAILED);
    expect(missing.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(existsSync(other)).toBe(false);

    const created = await cli("repo", "init", other, "--json");
    expect(created.code, created.stderr).toBe(EXIT_OK);
    expect(created.json()).toMatchObject({ path: other });
    expect((await cli("repo", "init", other, "--json")).json()).toMatchObject({
      code: "ALREADY_EXISTS",
    });
    mkdirSync(join(root, "busy"));
    writeFileSync(join(root, "busy", "file.txt"), "x");
    expect((await cli("repo", "init", join(root, "busy"), "--json")).code).toBe(EXIT_USAGE);
    expect((await cli("repo", "init", join(root, "x"), "--library", other)).code).toBe(EXIT_USAGE);

    await cli("--library", other, "skills", "install", "./src/alpha");
    expect(existsSync(join(other, "skills", "alpha", "SKILL.md"))).toBe(true);
    expect(
      (await cli("skills", "list", "--library", other, "--json")).json<unknown[]>(),
    ).toHaveLength(1);
    expect((await cli("skills", "list", "--json")).json<unknown[]>()).toHaveLength(0);
    expect((await cli("repo", "set", "./x", "--library", other, "--json")).code).toBe(EXIT_USAGE);
  });
});

describe("git backup", () => {
  it("reports, initialises and guards restore", async () => {
    expect((await cli("git", "status", "--json")).json()).toMatchObject({ isRepo: false });
    expect((await cli("git", "status")).stdout).toContain("not backed up");

    const init = await cli("git", "init", "--json");
    expect(init.code, init.stderr).toBe(EXIT_OK);
    expect(init.json()).toMatchObject({ isRepo: true, upstreamHealth: "no_remote" });
    // Setting up the backup makes its first commit, the first version to go back to.
    expect((await cli("git", "versions", "--limit", "5", "--json")).json()).toHaveLength(1);
    expect((await cli("git", "versions", "--limit", "many", "--json")).code).toBe(EXIT_USAGE);

    // An unknown version fails alike with and without --dry-run or --yes.
    for (const extra of [[], ["--dry-run"], ["--yes"]]) {
      const run = await cli("git", "restore", "sometag", ...extra, "--json");
      expect(run.code, extra.join(" ")).toBe(EXIT_FAILED);
      expect(run.json()).toMatchObject({ code: "NOT_FOUND" });
    }
  });
});

describe("published launcher", () => {
  const bundle = join(import.meta.dirname, "..", "dist", `${CLI_BINARY_NAME}.mjs`);

  // Needs `pnpm build` first; the launcher is a shell script, so not on Windows.
  it.skipIf(!existsSync(bundle) || process.platform === "win32")(
    "runs the real bundle the way an agent would",
    async () => {
      const core = createCore({
        homeDir: home,
        logger: silentLogger,
        safetyScannerPath: null,
        host: {
          appVersion: VERSION,
          bundledCliPath: bundle,
          nodeRunner: { command: process.execPath, env: {} },
        },
      });
      try {
        core.background.start();
        await expect.poll(async () => (await core.api.system.cliStatus()).published).toBe(true);
        const status = await core.api.system.cliStatus();
        expect(status).toMatchObject({
          version: VERSION,
          path: join(home, LIBRARY_DIR_NAME, "bin", CLI_BINARY_NAME),
        });
        const env = { ...process.env, HOME: home };
        const output = execFileSync(status.path, ["skills", "list", "--json"], {
          env,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
        expect(JSON.parse(output)).toEqual([]);
      } finally {
        core.close();
      }
    },
  );
});
