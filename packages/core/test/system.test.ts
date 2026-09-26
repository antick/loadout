import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AGENT_CONTROL_SKILL_NAME, APP_SLUG, CLI_BINARY_NAME } from "@loadout/shared";
import { createInstallService } from "../src/install";
import { LOG_FILE_NAME } from "../src/log";
import { readSkillIdentity } from "../src/skills/metadata";
import {
  type SystemService,
  createSystemService,
  posixLauncher,
  sanitizeText,
  windowsLauncher,
} from "../src/system";
import { type DeployWorld, createDeployWorld } from "./deploy-world";
import { makeSkill, writeFile } from "./helpers";

let world: DeployWorld;
let system: SystemService;

function build(): SystemService {
  const install = createInstallService(world.ctx, { store: world.store, registry: world.registry });
  return createSystemService(world.ctx, {
    store: world.store,
    install,
    deploy: world.deploy,
    registry: world.registry,
  });
}

beforeEach(() => {
  world = createDeployWorld();
  world.ctx.host.downloadsDir = join(world.home, "Downloads");
  world.ctx.host.appVersion = "1.2.3";
  system = build();
});

afterEach(() => world.cleanup());

describe("sanitizer", () => {
  it("hides the home folder, credentials, tokens and emails", () => {
    const text = [
      "/Users/somebody/projects/x and /fake/home/.library",
      "https://user:secret@example.com/repo.git",
      "token ghp_abcdefghijklmnop1234 and sk-abcdefghijklmnop",
      "mail person@example.com",
    ].join("\n");
    const clean = sanitizeText(text, "/fake/home");
    expect(clean).toContain("~/projects/x and ~/.library");
    expect(clean).toContain("https://<redacted>@example.com/repo.git");
    expect(clean).not.toContain("secret");
    expect(clean).not.toContain("ghp_");
    expect(clean).not.toContain("sk-abc");
    expect(clean).toContain("<email>");
  });

  it("hides GitLab and npm tokens and Authorization values, not ordinary words", () => {
    const text = [
      "glpat-abcdefghij12 npm_abcdefghijklmnop",
      "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.x.y",
      "Authorization: token 0123456789abcdef",
      "the token successfully refreshed",
    ].join("\n");
    const clean = sanitizeText(text, "/fake/home");
    expect(clean).not.toMatch(/glpat-|npm_a|eyJhbGci|0123456789abcdef/);
    expect(clean).toContain("Bearer <token>");
    expect(clean).toContain("the token successfully refreshed");
  });
});

describe("logs", () => {
  it("returns the tail of the log and notices warnings", async () => {
    const logPath = join(world.ctx.paths.logsDir, LOG_FILE_NAME);
    const lines = Array.from({ length: 250 }, (_, i) => `2026-01-01T00:00:00.000Z INFO  line ${i}`);
    writeFile(logPath, `${lines.join("\n")}\n`);
    const calm = await system.api.logExcerpt();
    expect(calm.lineCount).toBe(200);
    expect(calm.hasWarnings).toBe(false);
    expect(calm.excerpt.startsWith("2026-01-01T00:00:00.000Z INFO  line 50")).toBe(true);
    expect(calm.logPath).toBe(logPath);

    writeFile(logPath, `${lines.join("\n")}\n2026-01-01T00:00:01.000Z WARN  something odd\n`);
    expect((await system.api.logExcerpt()).hasWarnings).toBe(true);
  });

  it("copes with a log that does not exist yet", async () => {
    const excerpt = await system.api.logExcerpt();
    expect(excerpt).toMatchObject({ excerpt: "", lineCount: 0, hasWarnings: false });
  });

  it("exports logs, activity and diagnostics, and nothing private", async () => {
    const logsDir = world.ctx.paths.logsDir;
    writeFile(join(logsDir, LOG_FILE_NAME), `now ${world.home}/thing ghp_abcdefghijklmnop1234\n`);
    writeFile(join(logsDir, `${LOG_FILE_NAME}.1`), "older\n");
    writeFile(join(logsDir, "unrelated.txt"), "not a log\n");
    writeFile(join(logsDir, `${LOG_FILE_NAME}.bak`), "not a rotated log\n");
    world.ctx.activity.record("install", "demo", "local");

    const exported = await system.api.exportLogs();
    expect(exported.zipPath.startsWith(join(world.home, "Downloads"))).toBe(true);
    expect(exported.zipPath).toMatch(new RegExp(`${APP_SLUG}-logs-\\d{8}-\\d{6}\\.zip$`));

    const entries = unzipSync(readFileSync(exported.zipPath));
    const names = Object.keys(entries).sort();
    expect(names).toEqual([
      "activity.json",
      "diagnostics.json",
      `logs/${LOG_FILE_NAME}`,
      `logs/${LOG_FILE_NAME}.1`,
    ]);
    expect(exported.fileCount).toBe(names.length);
    expect(names.some((name) => name.endsWith(".db"))).toBe(false);

    const log = strFromU8(entries[`logs/${LOG_FILE_NAME}`] as Uint8Array);
    expect(log).toContain("~/thing");
    expect(log).not.toContain("ghp_");
    const activity = JSON.parse(strFromU8(entries["activity.json"] as Uint8Array)) as unknown[];
    expect(activity).toHaveLength(1);
    const diagnostics = JSON.parse(strFromU8(entries["diagnostics.json"] as Uint8Array)) as {
      appVersion: string;
    };
    expect(diagnostics.appVersion).toBe("1.2.3");
  });

  it("falls back to the home folder when Downloads can not be used", async () => {
    writeFileSync(join(world.home, "blocked"), "a file, not a folder");
    world.ctx.host.downloadsDir = join(world.home, "blocked", "Downloads");
    const exported = await system.api.exportLogs();
    expect(exported.zipPath.startsWith(world.home)).toBe(true);
    expect(existsSync(exported.zipPath)).toBe(true);
  });
});

describe("diagnostics and location", () => {
  it("reports the app, the machine and git", async () => {
    const info = await system.api.diagnostics();
    expect(info.appVersion).toBe("1.2.3");
    expect(info.os).toBe(process.platform);
    expect(info.arch).toBe(process.arch);
    expect(info.libraryPath).toBe(world.base);
    expect(info.libraryPathOverridden).toBe(true);
    expect(info.gitVersion).toMatch(/\d+\.\d+/);
  });

  it("queues a library move for the next start", async () => {
    const target = join(world.root, "elsewhere");
    const queued = await system.api.setLibraryPath(target);
    expect(queued.path).toBe(world.base);
    expect(queued.pendingPath).toBe(target);
    await expect(system.api.setLibraryPath("relative/path")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });

  it("lists recent activity newest first", async () => {
    world.ctx.activity.record("install", "first");
    world.ctx.activity.record("remove", "second");
    const entries = await system.api.activity(1);
    expect(entries.map((entry) => entry.subject)).toEqual(["second"]);
  });
});

describe("crash marker", () => {
  it("is absent on a clean start", async () => {
    expect(await system.api.lastCrash()).toBeNull();
  });

  it("reads, trims and clears the marker", async () => {
    const marker = world.ctx.paths.crashMarkerPath;
    const message = `boom at ${world.home}/app.js\nline two\nline three\nline four`;
    writeFile(marker, JSON.stringify({ at: 1234, message }));
    const crash = await system.api.lastCrash();
    expect(crash?.at).toBe(1234);
    expect(crash?.message).toBe("boom at ~/app.js\nline two\nline three");

    await system.api.clearLastCrash();
    expect(existsSync(marker)).toBe(false);
    expect(await system.api.lastCrash()).toBeNull();
    await system.api.clearLastCrash();
  });

  it("still reports a crash when the marker is not JSON", async () => {
    writeFile(world.ctx.paths.crashMarkerPath, "plain text panic");
    const crash = await system.api.lastCrash();
    expect(crash?.message).toBe("plain text panic");
    expect(crash?.at).toBeGreaterThan(0);
  });
});

describe("CLI publishing", () => {
  const binFile = (name: string): string => join(world.ctx.paths.binDir, name);

  function bundle(content: string): string {
    const path = join(world.root, "bundle", `${CLI_BINARY_NAME}.mjs`);
    writeFile(path, content);
    return path;
  }

  it("does nothing when no CLI is bundled", async () => {
    expect(await system.publishCli()).toMatchObject({ published: false, version: null });
    expect(existsSync(world.ctx.paths.binDir)).toBe(false);
  });

  it("publishes under the default base folder with a stamp and a launcher", async () => {
    world.ctx.host.bundledCliPath = bundle("console.log('cli-ok');\n");
    const status = await system.publishCli();
    expect(status).toEqual({
      published: true,
      path: binFile(process.platform === "win32" ? `${CLI_BINARY_NAME}.cmd` : CLI_BINARY_NAME),
      version: "1.2.3",
    });
    expect(world.ctx.paths.binDir.startsWith(world.ctx.paths.defaultBaseDir)).toBe(true);
    expect(readFileSync(binFile(".version"), "utf8").trim()).toBe("1.2.3");
    expect(await system.api.cliStatus()).toEqual(status);
    expect(readdirSync(world.ctx.paths.binDir).some((name) => name.includes("staged"))).toBe(false);
  });

  it.skipIf(process.platform === "win32")("writes a launcher that really runs", async () => {
    world.ctx.host.bundledCliPath = bundle(
      "console.log('ran:' + process.argv.slice(2).join(','));\n",
    );
    world.ctx.host.nodeRunner = { command: process.execPath, env: { LAUNCHER_TEST_FLAG: "it's" } };
    const status = await system.publishCli();
    expect(statSync(status.path).mode & 0o111).not.toBe(0);
    const output = execFileSync(status.path, ["a b", "c"], { encoding: "utf8" });
    expect(output.trim()).toBe("ran:a b,c");
  });

  it("republishes when the app version or the bundle changes", async () => {
    world.ctx.host.bundledCliPath = bundle("one\n");
    await system.publishCli();
    world.ctx.host.bundledCliPath = bundle("two, longer\n");
    world.ctx.host.appVersion = "2.0.0";
    const status = await system.publishCli();
    expect(status.version).toBe("2.0.0");
    expect(readFileSync(binFile(`${CLI_BINARY_NAME}.mjs`), "utf8")).toBe("two, longer\n");
  });

  it("never leaves an old stamp vouching for a failed publish", async () => {
    world.ctx.host.bundledCliPath = bundle("good\n");
    await system.publishCli();
    expect((await system.api.cliStatus()).published).toBe(true);

    world.ctx.host.appVersion = "2.0.0";
    world.ctx.host.bundledCliPath = join(world.root, "bundle", "missing.mjs");
    await expect(system.publishCli()).rejects.toThrow();
    expect(existsSync(binFile(".version"))).toBe(false);
    expect(await system.api.cliStatus()).toMatchObject({ published: false, version: null });
  });

  it("refuses an empty bundle and writes no stamp", async () => {
    world.ctx.host.bundledCliPath = bundle("");
    await expect(system.publishCli()).rejects.toMatchObject({ code: "IO" });
    expect(existsSync(binFile(".version"))).toBe(false);
    expect(existsSync(binFile(`${CLI_BINARY_NAME}.mjs`))).toBe(false);
  });

  it("treats an empty stamp or a missing script as not published", async () => {
    world.ctx.host.bundledCliPath = bundle("good\n");
    await system.publishCli();
    writeFileSync(binFile(".version"), "");
    expect((await system.api.cliStatus()).published).toBe(false);
    await system.publishCli();
    expect((await system.api.cliStatus()).published).toBe(true);
  });

  it("builds launchers that prefer the app runtime and fall back to node", () => {
    const input = {
      scriptPath: "/bin dir/cli.mjs",
      runner: {
        command: "/Apps/It's.app/run",
        env: { ELECTRON_RUN_AS_NODE: "1", "bad name": "x" },
      },
    };
    const posix = posixLauncher(input);
    expect(posix.startsWith("#!/bin/sh\n")).toBe(true);
    expect(posix).toContain(
      `ELECTRON_RUN_AS_NODE='1' exec '/Apps/It'\\''s.app/run' '/bin dir/cli.mjs' "$@"`,
    );
    expect(posix).toContain(`exec node '/bin dir/cli.mjs' "$@"`);
    expect(posix).not.toContain("bad name");
    expect(posixLauncher({ scriptPath: "/x.mjs", runner: null })).not.toContain("if [");

    const windows = windowsLauncher({
      scriptPath: "C:\\bin\\cli.mjs",
      runner: { command: "C:\\App\\app.exe", env: { ELECTRON_RUN_AS_NODE: "1" } },
    });
    expect(windows).toContain('set "ELECTRON_RUN_AS_NODE=1"');
    expect(windows).toContain('"C:\\App\\app.exe" "C:\\bin\\cli.mjs" %*');
    expect(windows).toContain(':fallback\r\nnode "C:\\bin\\cli.mjs" %*');
  });
});

describe("agent control", () => {
  function shipSkill(body = "# Manage skills\n"): void {
    const resources = join(world.root, "resources", "skills");
    makeSkill(resources, AGENT_CONTROL_SKILL_NAME, { body });
    world.ctx.host.bundledSkillDir = resources;
  }

  it("starts not installed and not dismissed, and can be dismissed", async () => {
    expect(await system.api.agentControlStatus()).toEqual({
      installed: false,
      skillId: null,
      dismissed: false,
    });
    await system.api.dismissAgentControl();
    expect((await system.api.agentControlStatus()).dismissed).toBe(true);
  });

  it("installs the bundled skill and deploys it to exactly the chosen agents", async () => {
    shipSkill();
    world.installAgents(".claude", ".cursor");
    const skill = await system.api.setupAgentControl(["claude_code"]);

    expect(skill.name).toBe(AGENT_CONTROL_SKILL_NAME);
    expect(skill.sourceType).toBe("local");
    expect(skill.deployments.map((d) => d.agentKey)).toEqual(["claude_code"]);
    const target = join(world.registry.get("claude_code").skillsDir, AGENT_CONTROL_SKILL_NAME);
    expect(lstatSync(target).isSymbolicLink() || lstatSync(target).isDirectory()).toBe(true);
    expect(existsSync(join(world.registry.get("cursor").skillsDir, AGENT_CONTROL_SKILL_NAME))).toBe(
      false,
    );
    expect(await system.api.agentControlStatus()).toEqual({
      installed: true,
      skillId: skill.id,
      dismissed: false,
    });
    expect(world.ctx.settings.get("agentControlPrompt")).toBe("installed");
  });

  it("refreshes the same skill when run again after the bundle changed", async () => {
    shipSkill();
    world.installAgents(".claude");
    const first = await system.api.setupAgentControl([]);
    shipSkill("# Manage skills, second edition\n");
    const second = await system.api.setupAgentControl(["claude_code"]);
    expect(second.id).toBe(first.id);
    expect(world.store.list()).toHaveLength(1);
    expect(readFileSync(join(second.libraryPath, "SKILL.md"), "utf8")).toContain("second edition");
  });

  it("refuses unknown or unavailable agents before touching the library", async () => {
    shipSkill();
    await expect(system.api.setupAgentControl(["nope"])).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(system.api.setupAgentControl(["claude_code"])).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(world.store.list()).toHaveLength(0);
    expect(world.ctx.settings.get("agentControlPrompt")).toBe("");
  });

  it("ships a real skill under the expected name", async () => {
    const shipped = join(import.meta.dirname, "../../../apps/desktop/resources/skills");
    const identity = readSkillIdentity(join(shipped, AGENT_CONTROL_SKILL_NAME));
    expect(identity.name).toBe(AGENT_CONTROL_SKILL_NAME);
    expect(identity.description?.length ?? 0).toBeGreaterThan(80);

    world.ctx.host.bundledSkillDir = shipped;
    const skill = await system.api.setupAgentControl([]);
    expect(skill.name).toBe(AGENT_CONTROL_SKILL_NAME);
    expect(skill.deployments).toEqual([]);
  });

  it("reports a build without the skill", async () => {
    await expect(system.api.setupAgentControl([])).rejects.toMatchObject({ code: "UNSUPPORTED" });
    world.ctx.host.bundledSkillDir = join(world.root, "empty");
    mkdirSync(world.ctx.host.bundledSkillDir, { recursive: true });
    await expect(system.api.setupAgentControl([])).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("never replaces a folder of the same name the user already has", async () => {
    shipSkill();
    world.installAgents(".claude");
    const theirs = makeSkill(
      world.registry.get("claude_code").skillsDir,
      AGENT_CONTROL_SKILL_NAME,
      {
        body: "# Mine\n",
      },
    );
    await expect(system.api.setupAgentControl(["claude_code"])).rejects.toMatchObject({
      code: "TARGET_CONFLICT",
    });
    expect(readFileSync(join(theirs, "SKILL.md"), "utf8")).toContain("# Mine");
    expect((await system.api.agentControlStatus()).installed).toBe(true);
  });
});
