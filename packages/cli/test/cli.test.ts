import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCore, silentLogger } from "@skillboard/core";
import { CLI_BINARY_NAME, LIBRARY_DIR_NAME } from "@skillboard/shared";
import { EXIT_FAILED, EXIT_OK, EXIT_USAGE } from "../src/run";
import { AGENT, type Run, type Sandbox, VERSION, createSandbox, writeSkill } from "./harness";

let sandbox: Sandbox;
let root: string;
let home: string;
const cli = (...argv: string[]): Promise<Run> => sandbox.cli(...argv);
const libraryDir = (): string => sandbox.libraryDir;
const agentSkillsDir = (): string => sandbox.agentSkillsDir;

beforeEach(() => {
  sandbox = createSandbox();
  ({ root, home } = sandbox);
});

afterEach(() => sandbox.cleanup());

describe("help, version and usage errors", () => {
  it("prints help at every level without opening a library", async () => {
    const top = await cli("--help");
    expect(top.code).toBe(EXIT_OK);
    for (const group of ["repo", "agents", "skills", "presets", "git"])
      expect(top.stdout).toContain(group);
    expect((await cli()).stdout).toContain(`Usage: ${CLI_BINARY_NAME}`);
    expect((await cli("skills", "--help")).stdout).toContain("adopt");
    const command = await cli("skills", "remove", "--help");
    expect(command.stdout).toContain("--dry-run");
    expect(command.stdout).toContain("--yes");
    expect(existsSync(join(home, LIBRARY_DIR_NAME))).toBe(false);
  });

  it("prints the version", async () => {
    expect((await cli("--version")).stdout.trim()).toBe(VERSION);
    expect((await cli("--version", "--json")).json()).toEqual({ version: VERSION });
  });

  it("exits 2 with INVALID_INPUT for wrong usage", async () => {
    for (const argv of [
      ["nope", "list"],
      ["skills", "frobnicate"],
      ["skills"],
      ["skills", "list", "--bogus"],
      ["skills", "show"],
    ]) {
      const run = await cli(...argv, "--json");
      expect(run.code, argv.join(" ")).toBe(EXIT_USAGE);
      expect(run.stdout).toBe("");
      expect(run.json()).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    }
    const human = await cli("skills", "show");
    expect(human.code).toBe(EXIT_USAGE);
    expect(human.stderr).toContain("Error (INVALID_INPUT)");
  });

  it("exits 1 with the error code for a failed operation", async () => {
    const run = await cli("skills", "show", "ghost", "--json");
    expect(run.code).toBe(EXIT_FAILED);
    expect(run.stdout).toBe("");
    const body = run.json<{ ok: boolean; code: string; message: string }>();
    expect(body).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(body.message).toContain("ghost");
  });
});

describe("skills: install, deploy, status, remove", () => {
  it("runs the whole life of a skill", async () => {
    writeSkill(join(root, "src"), "alpha");
    const installed = await cli("skills", "install", "./src/alpha", "--json");
    expect(installed.code).toBe(EXIT_OK);
    const [skill] = installed.json<{ installed: { id: string; name: string }[] }>().installed;
    expect(skill?.name).toBe("alpha");
    expect(existsSync(join(libraryDir(), "alpha", "SKILL.md"))).toBe(true);
    // Installing is library-only.
    expect(existsSync(join(agentSkillsDir(), "alpha"))).toBe(false);

    const listed = await cli("skills", "list", "--json");
    expect(listed.json<{ name: string }[]>().map((s) => s.name)).toEqual(["alpha"]);
    expect((await cli("skills", "list")).stdout).toContain("alpha");
    expect((await cli("skills", "list", "--source", "git", "--json")).json()).toEqual([]);

    const deployed = await cli("skills", "deploy", "alpha", "--agent", AGENT, "--json");
    expect(deployed.json()).toMatchObject({ added: 1, conflicts: [], failed: [] });
    expect(lstatSync(join(agentSkillsDir(), "alpha")).isSymbolicLink()).toBe(true);
    expect((await cli("skills", "deploy", "alpha", "-a", AGENT, "--json")).json()).toMatchObject({
      added: 0,
      skipped: 1,
    });

    const status = await cli("skills", "status", skill?.id ?? "", "--json");
    const mine = status
      .json<{ agents: { agent: string; deployed: boolean; presentOnDisk: boolean }[] }>()
      .agents.find((a) => a.agent === AGENT);
    expect(mine).toMatchObject({ deployed: true, presentOnDisk: true });

    const undeployed = await cli("skills", "undeploy", "alpha", "--agent", AGENT, "--json");
    expect(undeployed.json()).toMatchObject({ removed: 1 });
    expect(existsSync(join(agentSkillsDir(), "alpha"))).toBe(false);

    await cli("skills", "deploy", "alpha", "--agent", AGENT);
    const removed = await cli("skills", "remove", "alpha", "--yes", "--json");
    expect(removed.json()).toMatchObject({ dryRun: false, removed: 1, failed: [] });
    expect(existsSync(join(libraryDir(), "alpha"))).toBe(false);
    expect(existsSync(join(agentSkillsDir(), "alpha"))).toBe(false);
    expect((await cli("skills", "list", "--json")).json()).toEqual([]);
  });

  it("refuses to remove without --yes and changes nothing on a dry run", async () => {
    writeSkill(join(root, "src"), "alpha");
    await cli("skills", "install", "./src/alpha");
    await cli("skills", "deploy", "alpha", "--agent", AGENT);

    const refused = await cli("skills", "remove", "alpha", "--json");
    expect(refused.code).toBe(EXIT_USAGE);
    expect(refused.json()).toMatchObject({ ok: false, code: "INVALID_INPUT" });

    const dry = await cli("skills", "remove", "alpha", "ghost", "--dry-run", "--json");
    expect(dry.code).toBe(EXIT_OK);
    const body = dry.json<{
      dryRun: boolean;
      wouldRemove: { name: string; deployedTo: string[] }[];
      failed: { name: string }[];
    }>();
    expect(body.dryRun).toBe(true);
    expect(body.wouldRemove).toMatchObject([{ name: "alpha", deployedTo: [AGENT] }]);
    expect(body.failed.map((f) => f.name)).toEqual(["ghost"]);
    expect(existsSync(join(libraryDir(), "alpha", "SKILL.md"))).toBe(true);
    expect(lstatSync(join(agentSkillsDir(), "alpha")).isSymbolicLink()).toBe(true);

    // A real run with one bad reference removes nothing at all.
    const partial = await cli("skills", "remove", "alpha", "ghost", "--yes", "--json");
    expect(partial.code).toBe(EXIT_FAILED);
    expect(partial.json()).toMatchObject({ code: "NOT_FOUND" });
    expect(existsSync(join(libraryDir(), "alpha"))).toBe(true);
  });

  it("reports TARGET_CONFLICT with the paths and leaves the folder alone", async () => {
    writeSkill(join(root, "src"), "alpha");
    await cli("skills", "install", "./src/alpha");
    const theirs = writeSkill(agentSkillsDir(), "alpha", "# hand made\n");

    const run = await cli("skills", "deploy", "alpha", "--agent", AGENT, "--json");
    expect(run.code).toBe(EXIT_FAILED);
    const body = run.json<{
      code: string;
      details: { conflicts: { path: string; reason: string }[] };
    }>();
    expect(body.code).toBe("TARGET_CONFLICT");
    expect(body.details.conflicts.map((c) => c.path)).toEqual([theirs]);
    expect(readFileSync(join(theirs, "SKILL.md"), "utf8")).toContain("hand made");
    expect((await cli("skills", "deploy", "alpha", "--agent", AGENT)).stderr).toContain(theirs);
  });

  it("checks agents before deploying", async () => {
    writeSkill(join(root, "src"), "alpha");
    await cli("skills", "install", "./src/alpha");
    expect((await cli("skills", "deploy", "alpha", "--json")).code).toBe(EXIT_USAGE);
    expect(
      (await cli("skills", "deploy", "alpha", "--agent", "nope", "--json")).json(),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect(
      (await cli("skills", "deploy", "alpha", "--agent", "cursor", "--json")).json(),
    ).toMatchObject({ code: "INVALID_INPUT" });
  });

  it("adds and removes tags", async () => {
    writeSkill(join(root, "src"), "alpha");
    await cli("skills", "install", "./src/alpha");
    const tagged = await cli("skills", "tag", "alpha", "--add", "work", "--add", "docs", "--json");
    expect(tagged.json<{ tags: string[] }>().tags.sort()).toEqual(["docs", "work"]);
    expect(
      (await cli("skills", "tag", "alpha", "--remove", "work", "--json")).json<{ tags: string[] }>()
        .tags,
    ).toEqual(["docs"]);
    expect((await cli("skills", "list", "--tag", "docs", "--json")).json<unknown[]>()).toHaveLength(
      1,
    );
    expect((await cli("skills", "list", "--tag", "work", "--json")).json<unknown[]>()).toHaveLength(
      0,
    );
  });

  it("reports local skills as having no upstream", async () => {
    writeSkill(join(root, "src"), "alpha");
    await cli("skills", "install", "./src/alpha");
    expect((await cli("skills", "check", "--json")).code).toBe(EXIT_USAGE);
    expect((await cli("skills", "check", "alpha", "--all", "--json")).code).toBe(EXIT_USAGE);
    const checked = await cli("skills", "check", "alpha", "--json");
    expect(checked.json()).toMatchObject({ name: "alpha", updateStatus: "local_only" });
  });
});

describe("skills adopt", () => {
  it("previews, then imports and takes over an agent's own skills", async () => {
    const local = writeSkill(agentSkillsDir(), "handmade", "# by hand\n");
    const dry = await cli("skills", "adopt", agentSkillsDir(), "--dry-run", "--json");
    expect(dry.json()).toMatchObject({
      dryRun: true,
      agent: AGENT,
      candidates: [{ name: "handmade" }],
      skipped: [],
    });
    expect(lstatSync(local).isSymbolicLink()).toBe(false);
    expect(existsSync(join(libraryDir(), "handmade"))).toBe(false);

    const real = await cli("skills", "adopt", "~/.claude/skills", "--json");
    expect(real.code).toBe(EXIT_OK);
    expect(real.json()).toMatchObject({
      dryRun: false,
      adopted: [{ name: "handmade" }],
      failed: [],
    });
    expect(readFileSync(join(libraryDir(), "handmade", "SKILL.md"), "utf8")).toContain("by hand");
    expect(readFileSync(join(local, "SKILL.md"), "utf8")).toContain("by hand");
    const listed = (await cli("skills", "list", "--json")).json<
      { name: string; deployments: { agentKey: string }[] }[]
    >();
    expect(listed[0]?.deployments.map((d) => d.agentKey)).toEqual([AGENT]);

    const again = await cli("skills", "adopt", agentSkillsDir(), "--json");
    expect(again.json()).toMatchObject({
      adopted: [],
      skipped: [{ name: "handmade", reason: "already managed" }],
    });
  });

  it("refuses folders that belong to no agent", async () => {
    mkdirSync(join(root, "random"), { recursive: true });
    expect((await cli("skills", "adopt", "./random", "--json")).json()).toMatchObject({
      code: "INVALID_INPUT",
    });
    expect((await cli("skills", "adopt", "./missing", "--json")).json()).toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("agents", () => {
  it("lists, disables and enables", async () => {
    const installed = (await cli("agents", "list", "--installed", "--json")).json<
      { key: string }[]
    >();
    expect(installed.map((a) => a.key)).toContain(AGENT);
    expect((await cli("agents", "list", "--json")).json<unknown[]>().length).toBeGreaterThan(
      installed.length,
    );

    expect((await cli("agents", "disable", AGENT, "--json")).json()).toEqual([
      { agent: AGENT, enabled: false, changed: true },
    ]);
    expect((await cli("agents", "disable", AGENT, "--json")).json()).toEqual([
      { agent: AGENT, enabled: false, changed: false },
    ]);
    expect((await cli("agents", "enable", AGENT, "--json")).json()).toEqual([
      { agent: AGENT, enabled: true, changed: true },
    ]);

    const typo = await cli("agents", "disable", AGENT, "nope", "--json");
    expect(typo.json()).toMatchObject({ code: "NOT_FOUND" });
    const after = (await cli("agents", "list", "--json")).json<
      { key: string; enabled: boolean }[]
    >();
    expect(after.find((a) => a.key === AGENT)?.enabled).toBe(true);
  });
});

describe("presets", () => {
  it("creates, fills, deploys, undeploys and deletes", async () => {
    writeSkill(join(root, "src"), "alpha");
    writeSkill(join(root, "src"), "beta");
    await cli("skills", "install", "./src/alpha");
    await cli("skills", "install", "./src/beta");

    const created = await cli(
      "presets",
      "create",
      "Writing",
      "--description",
      "Docs work",
      "--json",
    );
    expect(created.json()).toMatchObject({ name: "Writing", description: "Docs work" });
    expect(
      (await cli("presets", "add", "writing", "alpha", "beta", "--json")).json<{
        skillIds: string[];
      }>().skillIds,
    ).toHaveLength(2);
    expect(
      (await cli("presets", "show", "Writing", "--json"))
        .json<{ skills: { name: string }[] }>()
        .skills.map((s) => s.name)
        .sort(),
    ).toEqual(["alpha", "beta"]);

    expect(
      (await cli("presets", "deploy", "Writing", "--agent", AGENT, "--json")).json(),
    ).toMatchObject({ added: 2 });
    expect(existsSync(join(agentSkillsDir(), "alpha"))).toBe(true);
    expect(existsSync(join(agentSkillsDir(), "beta"))).toBe(true);

    expect((await cli("presets", "undeploy", "Writing", "--json")).json()).toMatchObject({
      removed: 2,
    });
    expect(existsSync(join(agentSkillsDir(), "alpha"))).toBe(false);

    expect((await cli("presets", "deploy", "Writing", "--json")).json()).toMatchObject({
      added: 2,
    });
    expect(
      (await cli("presets", "remove", "Writing", "beta", "--json")).json<{ skillIds: string[] }>()
        .skillIds,
    ).toHaveLength(1);

    expect((await cli("presets", "delete", "Writing", "--json")).code).toBe(EXIT_USAGE);
    expect((await cli("presets", "delete", "Writing", "--dry-run", "--json")).json()).toMatchObject(
      { dryRun: true },
    );
    expect(
      (await cli("presets", "list", "--json")).json<{ name: string }[]>().map((p) => p.name),
    ).toContain("Writing");
    expect((await cli("presets", "delete", "Writing", "--yes", "--json")).json()).toMatchObject({
      dryRun: false,
    });
    expect((await cli("presets", "show", "Writing", "--json")).json()).toMatchObject({
      code: "NOT_FOUND",
    });
    // Deleting a preset never deletes its skills.
    expect((await cli("skills", "list", "--json")).json<unknown[]>()).toHaveLength(2);
  });
});

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

  it("works on another library without touching the saved one", async () => {
    writeSkill(join(root, "src"), "alpha");
    const other = join(root, "other-library");
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
    expect((await cli("git", "versions", "--limit", "5", "--json")).json()).toEqual([]);
    expect((await cli("git", "versions", "--limit", "many", "--json")).code).toBe(EXIT_USAGE);

    expect((await cli("git", "restore", "sometag", "--json")).code).toBe(EXIT_USAGE);
    expect((await cli("git", "restore", "sometag", "--dry-run", "--json")).json()).toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("published launcher", () => {
  const bundle = join(import.meta.dirname, "..", "dist", `${CLI_BINARY_NAME}.mjs`);

  // Needs `bun run build` first; the launcher is a shell script, so not on Windows.
  it.skipIf(!existsSync(bundle) || process.platform === "win32")(
    "runs the real bundle the way an agent would",
    async () => {
      const core = createCore({
        homeDir: home,
        configDir: join(root, "config"),
        logger: silentLogger,
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

describe("output hygiene", () => {
  it("keeps stdout for the result and stderr for failures", async () => {
    const ok = await cli("skills", "list", "--json");
    expect(ok.stderr).toBe("");
    expect(() => JSON.parse(ok.stdout)).not.toThrow();
    const bad = await cli("skills", "show", "ghost");
    expect(bad.stdout).toBe("");
    expect(bad.stderr).toContain("NOT_FOUND");
    expect(dirname(libraryDir())).toBe(join(home, LIBRARY_DIR_NAME));
  });
});
