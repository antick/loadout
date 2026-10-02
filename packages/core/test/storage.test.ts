import { existsSync, lstatSync, readFileSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGitClient } from "../src/install/git-client";
import { createPublishService } from "../src/publish";
import { type StorageService, createRemovedStore, createStorageService } from "../src/storage";
import { type DeployWorld, createDeployWorld } from "./deploy-world";
import { writeFile } from "./helpers";

let world: DeployWorld;
let storage: StorageService;

beforeEach(() => {
  world = createDeployWorld();
  storage = createStorageService(world.ctx, {
    deploy: world.deploy,
    store: world.store,
    git: createGitClient(world.ctx),
    removed: createRemovedStore(world.ctx, { store: world.store }),
    publish: createPublishService(world.ctx, { store: world.store }),
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

  it("empties the clone cache and the publishing working copies", async () => {
    writeFile(join(world.ctx.paths.cacheDir, "repos", "0123456789abcdef", "HEAD"), "ref");
    writeFile(join(world.ctx.paths.cacheDir, "publish", "0123456789abcdef", "HEAD"), "refs");
    expect(await storage.api.clear("cache")).toBe(7);
    expect(existsSync(join(world.ctx.paths.cacheDir, "repos", "0123456789abcdef"))).toBe(false);
    expect(existsSync(join(world.ctx.paths.cacheDir, "publish", "0123456789abcdef"))).toBe(false);
  });

  it("removes old logs and empties the current one", async () => {
    const current = join(world.ctx.paths.logsDir, "loadout.log");
    writeFile(current, "today\n");
    writeFile(`${current}.1`, "yesterday\n");
    Object.defineProperty(world.ctx.log, "filePath", { value: current });

    writeFile(world.ctx.paths.crashMarkerPath, "{}");

    expect(await storage.api.clear("logs")).toBe(16);
    expect(readFileSync(current, "utf8")).toBe("");
    expect(existsSync(`${current}.1`)).toBe(false);
    // The notice about the last crash is not a log: it waits to be shown.
    expect(existsSync(world.ctx.paths.crashMarkerPath)).toBe(true);
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

  it("keeps every linked skill as a real folder when asked, before anything goes", async () => {
    // Cline and Warp share one folder: one link, one copy.
    world.installAgents(".claude", ".codex", ".cline", ".warp");
    const alpha = world.addSkill("alpha", { "notes.md": "keep me\n" });
    await world.deploy.api.deploy(alpha.id, "claude_code");
    await world.deploy.api.deploy(alpha.id, "cline");
    await world.deploy.api.deploy(alpha.id, "warp");
    world.ctx.settings.set("deployMode", "copy");
    await world.deploy.api.deploy(alpha.id, "codex");
    expect(await storage.api.agentFolders()).toMatchObject({ linkedFolders: 2, copiedFolders: 1 });
    expect((await storage.api.agentFolders()).linkedBytes).toBeGreaterThan(0);

    const plan = await storage.prepareRemoval({ removeCopies: false, keepLinkedSkills: true });
    expect(plan.undeployed).toBe(0);
    for (const folder of [".claude/skills", ".agents/skills", ".codex/skills"]) {
      const path = join(world.home, folder, "alpha");
      expect(lstatSync(path).isSymbolicLink(), folder).toBe(false);
      expect(readFileSync(join(path, "notes.md"), "utf8")).toBe("keep me\n");
    }
    expect(world.store.deployments().every((row) => row.mode === "copy")).toBe(true);
    // Nothing half-written was left beside them.
    expect(readdirSync(join(world.home, ".claude", "skills"))).toEqual(["alpha"]);
  });

  it("leaves a link alone when it no longer points at its library skill", async () => {
    world.installAgents(".claude");
    const alpha = world.addSkill("alpha");
    await world.deploy.api.deploy(alpha.id, "claude_code");
    const link = join(world.home, ".claude", "skills", "alpha");
    rmSync(link);
    symlinkSync(join(world.home, "elsewhere"), link);
    expect((await storage.api.agentFolders()).linkedFolders).toBe(0);
    await storage.prepareRemoval({ removeCopies: false, keepLinkedSkills: true });
    // Never turned into a copy of the library skill.
    expect(existsSync(join(link, "SKILL.md"))).toBe(false);
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
