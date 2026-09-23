import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGitClient } from "../src/install/git-client";
import { type StorageService, createStorageService } from "../src/storage";
import { type DeployWorld, createDeployWorld } from "./deploy-world";
import { writeFile } from "./helpers";

let world: DeployWorld;
let storage: StorageService;

beforeEach(() => {
  world = createDeployWorld();
  storage = createStorageService(world.ctx, {
    deploy: world.deploy,
    git: createGitClient(world.ctx),
  });
});
afterEach(() => world.cleanup());

const areaOf = async (area: string) =>
  (await storage.api.report()).entries.find((entry) => entry.area === area);

describe("report", () => {
  it("measures every area and says which can be cleared", async () => {
    world.addSkill("alpha", { "notes.md": "x".repeat(1000) });
    writeFile(join(world.ctx.paths.historyDir, "alpha", "SKILL.md", "1.bin"), "old");

    const report = await storage.api.report();
    expect(report.libraryPath).toBe(world.ctx.paths.baseDir);
    expect(report.homePath).toBe(world.ctx.paths.defaultBaseDir);
    expect((await areaOf("skills"))?.bytes).toBeGreaterThan(1000);
    expect(await areaOf("history")).toMatchObject({ bytes: 3, clearable: true, exists: true });
    expect(await areaOf("database")).toMatchObject({ clearable: false });
    expect((await areaOf("database"))?.bytes).toBeGreaterThan(0);
    // Outside the desktop app there is no app data folder to report.
    expect(await areaOf("app")).toBeUndefined();
    expect(report.totalBytes).toBe(report.entries.reduce((sum, entry) => sum + entry.bytes, 0));
  });

  it("reports a folder removed from outside as empty, not as an error", async () => {
    expect(await areaOf("history")).toMatchObject({ bytes: 0, exists: false });
  });
});

describe("clear", () => {
  it("empties the editor history", async () => {
    writeFile(join(world.ctx.paths.historyDir, "alpha", "SKILL.md", "1.bin"), "12345");
    expect(await storage.api.clear("history")).toBe(5);
    expect(existsSync(world.ctx.paths.historyDir)).toBe(false);
  });

  it("empties the clone cache", async () => {
    writeFile(join(world.ctx.paths.cacheDir, "repos", "0123456789abcdef", "HEAD"), "ref");
    expect(await storage.api.clear("cache")).toBe(3);
    expect(existsSync(join(world.ctx.paths.cacheDir, "repos", "0123456789abcdef"))).toBe(false);
  });

  it("removes old logs and empties the current one", async () => {
    const current = join(world.ctx.paths.logsDir, "loadout.log");
    writeFile(current, "today\n");
    writeFile(`${current}.1`, "yesterday\n");
    Object.defineProperty(world.ctx.log, "filePath", { value: current });

    expect(await storage.api.clear("logs")).toBe(16);
    expect(readFileSync(current, "utf8")).toBe("");
    expect(existsSync(`${current}.1`)).toBe(false);
  });

  it("refuses the areas that hold data", async () => {
    await expect(storage.api.clear("skills" as never)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });
});

describe("prepareRemoval", () => {
  it("takes links out of agent folders and keeps copies unless asked", async () => {
    world.installAgents(".claude", ".codex");
    const alpha = world.addSkill("alpha");
    await world.deploy.api.deploy(alpha.id, "claude_code");
    world.ctx.settings.set("deployMode", "copy");
    await world.deploy.api.deploy(alpha.id, "codex");
    const link = join(world.home, ".claude", "skills", "alpha");
    const copy = join(world.home, ".codex", "skills", "alpha");
    expect(lstatSync(link).isSymbolicLink()).toBe(true);

    const plan = await storage.prepareRemoval({ removeCopies: false });
    expect(plan.undeployed).toBe(1);
    expect(existsSync(link)).toBe(false);
    expect(existsSync(join(copy, "SKILL.md"))).toBe(true);

    await storage.prepareRemoval({ removeCopies: true });
    expect(existsSync(copy)).toBe(false);
  });

  it("removes a moved library's own parts and its folder only if empty", async () => {
    const plan = await storage.prepareRemoval({ removeCopies: false });
    const { paths } = world.ctx;
    // The test library sits outside the home data folder, like a moved one.
    expect(plan.paths).toContain(paths.defaultBaseDir);
    expect(plan.paths).toContain(paths.skillsDir);
    expect(plan.paths).toContain(paths.dbPath);
    expect(plan.paths).not.toContain(paths.baseDir);
    expect(plan.emptyDirs).toEqual([paths.baseDir]);
  });
});
