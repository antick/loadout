import * as fs from "node:fs";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFileHistory } from "../src/editor";
import { createGitClient } from "../src/install/git-client";
import { type SkillsService, createSkillsService } from "../src/skills/service";
import { type StorageService, createStorageService } from "../src/storage";
import { moveEntrySync } from "../src/util/fs";
import { makeSkill } from "./helpers";
import { type WorkspaceWorld, createWorkspaceWorld, skillText } from "./workspace-world";

/**
 * Two disks, simulated: while `crossDisk` is on, a rename into another folder fails the way it
 * does between volumes (EXDEV), so moves take the copy-then-remove path. Renames within one
 * folder (atomic writes) still work, as they do on a real disk. `failRemoveOf` makes removing that
 * one path fail, like a file held open on Windows.
 */
const disk = vi.hoisted(() => ({
  crossDisk: false,
  failRemoveOf: null as string | null,
  exdev: (): never => {
    throw Object.assign(new Error("EXDEV: cross-device link not permitted"), { code: "EXDEV" });
  },
}));

vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof fs>();
  return {
    ...real,
    renameSync: (from: fs.PathLike, to: fs.PathLike) =>
      disk.crossDisk && dirname(String(from)) !== dirname(String(to))
        ? disk.exdev()
        : real.renameSync(from, to),
    rmSync: (path: fs.PathLike, options?: fs.RmOptions) => {
      if (disk.failRemoveOf !== null && String(path) === disk.failRemoveOf) {
        throw Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" });
      }
      real.rmSync(path, options);
    },
  };
});

describe("moving across disks", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(join(fs.realpathSync(tmpdir()), "exdev-"));
    mkdirSync(join(root, "other-disk"));
    disk.crossDisk = true;
    disk.failRemoveOf = null;
  });
  afterEach(() => {
    disk.crossDisk = false;
    disk.failRemoveOf = null;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("copies the whole folder, keeps links as links, then removes the original", () => {
    const from = makeSkill(root, "notes", { files: { "refs/deep/a.md": "deep" } });
    symlinkSync("refs/deep/a.md", join(from, "link.md"));
    const to = join(root, "other-disk", "moved");

    moveEntrySync(from, to);

    expect(existsSync(from)).toBe(false);
    expect(readFileSync(join(to, "refs", "deep", "a.md"), "utf8")).toBe("deep");
    expect(lstatSync(join(to, "link.md")).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(join(to, "link.md"))).toBe("refs/deep/a.md");
  });

  it("reports an original it cannot remove instead of failing, the copy being whole", () => {
    const from = makeSkill(root, "notes");
    const to = join(root, "other-disk", "moved");
    disk.failRemoveOf = from;
    const leftovers: unknown[] = [];

    moveEntrySync(from, to, { onLeftover: (error) => leftovers.push(error) });

    expect(leftovers).toHaveLength(1);
    expect(skillText(to)).toContain("notes");
    expect(existsSync(from)).toBe(true);
  });

  it("never copies into something already there", () => {
    const from = makeSkill(root, "notes", { body: "mine" });
    const to = makeSkill(join(root, "other-disk"), "notes", { body: "theirs" });

    expect(() => moveEntrySync(from, to)).toThrow(/EXDEV/);

    expect(skillText(from)).toContain("mine");
    expect(skillText(to)).toContain("theirs");
    expect(existsSync(join(to, "refs"))).toBe(false);
  });

  it("removes a copy that failed halfway and leaves the original alone", () => {
    const from = makeSkill(root, "notes");
    const unreadable = join(from, "secret.md");
    writeFileSync(unreadable, "x");
    fs.chmodSync(unreadable, 0o000);
    const to = join(root, "other-disk", "moved");
    try {
      // Root can read anything: there is no halfway to test.
      if (process.getuid?.() === 0) return;
      expect(() => moveEntrySync(from, to)).toThrow();
      expect(existsSync(to)).toBe(false);
      expect(existsSync(join(from, "SKILL.md"))).toBe(true);
    } finally {
      fs.chmodSync(unreadable, 0o600);
    }
  });
});

describe("Recently removed on another disk", () => {
  let world: WorkspaceWorld;
  let skills: SkillsService;
  let storage: StorageService;

  beforeEach(() => {
    world = createWorkspaceWorld();
    world.installAgents(".claude");
    skills = createSkillsService(world.ctx, {
      store: world.store,
      removeDeployments: world.deploy.removeAllForSkill,
      history: createFileHistory(world.ctx.paths.historyDir),
      install: () => Promise.reject(new Error("not used here")),
      rename: { deploy: world.deploy, projectSkillFolders: () => [] },
      removed: world.removed,
    });
    storage = createStorageService(world.ctx, {
      deploy: world.deploy,
      git: createGitClient(world.ctx),
      removed: world.removed,
    });
    disk.crossDisk = true;
  });
  afterEach(() => {
    disk.crossDisk = false;
    world.cleanup();
  });

  it("keeps a deleted library skill and a deleted agent folder, and puts both back", async () => {
    const skill = world.addSkill("notes", { "refs/a.md": "reference" });
    const result = await skills.api.removeMany([skill.id]);
    expect(result.failed).toEqual([]);
    const [libraryId] = result.removedIds;
    expect(existsSync(skill.libraryPath)).toBe(false);

    const claude = join(world.home, ".claude", "skills");
    mkdirSync(claude, { recursive: true });
    const local = makeSkill(claude, "by-hand", { body: "only copy" });
    const [localId] = await world.workspace.api.deleteLocal("claude_code", "by-hand");
    expect(existsSync(local)).toBe(false);
    expect(await storage.api.removed()).toHaveLength(2);

    await storage.api.restoreRemoved(libraryId ?? "");
    await storage.api.restoreRemoved(localId ?? "");

    expect(readFileSync(join(skill.libraryPath, "refs", "a.md"), "utf8")).toBe("reference");
    expect(world.store.get(skill.id).libraryPath).toBe(skill.libraryPath);
    expect(skillText(local)).toContain("only copy");
    expect(await storage.api.removed()).toEqual([]);
  });
});
