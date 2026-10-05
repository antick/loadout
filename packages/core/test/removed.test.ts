import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { REMOVED_KEEP_DAYS } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDeployService } from "../src/deploy";
import { createGitClient } from "../src/install/git-client";
import { installIntoLibrary } from "../src/install/library";
import { createWorkspaceService } from "../src/workspace";
import { type StorageService, createStorageService } from "../src/storage";
import { LIBRARY_PLACE } from "../src/storage/removed-library";
import { makeSkill, writeFile } from "./helpers";
import {
  type WorkspaceWorld,
  createWorkspaceWorld,
  isLink,
  rejection,
  setContentMtime,
  skillText,
} from "./workspace-world";
import { createPublishService } from "../src/publish";

const T0 = Date.UTC(2026, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1000;

describe("recently removed", () => {
  let world: WorkspaceWorld;
  let storage: StorageService;
  let claude: string;
  const workspace = () => world.workspace.api;

  beforeEach(() => {
    world = createWorkspaceWorld();
    world.installAgents(".claude", ".cursor");
    claude = join(world.home, ".claude", "skills");
    storage = createStorageService(world.ctx, {
      deploy: world.deploy,
      store: world.store,
      git: createGitClient(world.ctx),
      removed: world.removed,
      publish: createPublishService(world.ctx, { store: world.store }),
    });
  });
  afterEach(() => world.cleanup());

  it("keeps a deleted local skill and puts it back where it was", async () => {
    const local = makeSkill(claude, "notes", { body: "my only copy" });
    const [id] = await workspace().deleteLocal("claude_code", "notes");
    expect(existsSync(local)).toBe(false);

    const [entry] = await storage.api.removed();
    expect(entry).toMatchObject({
      id,
      name: "notes",
      originalPath: local,
      place: "Claude Code",
      reason: "deleted",
      occupied: false,
      parentMissing: false,
    });
    expect(entry?.bytes).toBeGreaterThan(0);
    expect(entry?.expiresAt).toBe((entry?.removedAt ?? 0) + REMOVED_KEEP_DAYS * DAY_MS);

    const restored = await storage.api.restoreRemoved(id ?? "");
    expect(restored).toEqual({ path: local, displacedId: null });
    expect(skillText(local)).toContain("my only copy");
    expect(await storage.api.removed()).toEqual([]);
    expect(world.ctx.activity.list()[0]).toMatchObject({ kind: "restore", subject: "notes" });
  });

  it("keeps the edited copy a pull replaces, and nothing when it matched the library", async () => {
    const skill = world.addSkill("doc");
    world.store.update(skill.id, { sourceRef: join(claude, "doc") });
    const local = makeSkill(claude, "doc", { body: "edited by hand" });
    setContentMtime(local, T0);
    setContentMtime(skill.libraryPath, T0 + 60_000);

    const kept = await workspace().pull("claude_code", "doc");
    expect(kept).toHaveLength(1);
    expect(skillText(local)).toBe(skillText(skill.libraryPath));
    const [entry] = await storage.api.removed();
    expect(entry).toMatchObject({ reason: "replaced", originalPath: local, occupied: true });
    // Nothing of the old copy is left behind in the agent's folder.
    expect(readFileSync(join(claude, "doc", "SKILL.md"), "utf8")).not.toContain("edited");

    // Undo: the edited copy comes back; the library version it replaces is still in the library.
    const restored = await storage.api.restoreRemoved(entry?.id ?? "");
    expect(skillText(local)).toContain("edited by hand");
    expect(restored.displacedId).toBeNull();
    expect(await storage.api.removed()).toEqual([]);

    // Anything else in the way is put aside in turn, so a restore never loses a thing.
    const [again] = await workspace().deleteLocal("claude_code", "doc");
    makeSkill(claude, "doc", { body: "written since" });
    const second = await storage.api.restoreRemoved(again ?? "");
    expect(skillText(local)).toContain("edited by hand");
    const [displaced] = await storage.api.removed();
    expect(displaced).toMatchObject({ id: second.displacedId, reason: "replaced" });
    expect(displaced?.id).not.toBeUndefined();
  });

  it("keeps a .git folder and links when a local skill is uploaded and adopted", async () => {
    const local = makeSkill(claude, "tracked");
    writeFile(join(local, ".git", "HEAD"), "ref: refs/heads/main\n");
    symlinkSync(join(local, "SKILL.md"), join(local, "alias.md"));
    const deploy = createDeployService(world.ctx, {
      store: world.store,
      registry: world.registry,
      removed: world.removed,
    });
    const uploader = createWorkspaceService(world.ctx, {
      store: world.store,
      registry: world.registry,
      deploy,
      install: {
        installIntoLibrary: (request) => installIntoLibrary(world.ctx, world.store, request),
      },
      removed: world.removed,
    });
    await uploader.api.upload("claude_code", "tracked");

    const [entry] = await storage.api.removed();
    expect(entry).toMatchObject({ name: "tracked", reason: "replaced" });
    const kept = join(world.ctx.paths.removedDir, entry?.id ?? "", "content");
    expect(readFileSync(join(kept, ".git", "HEAD"), "utf8")).toContain("main");
    expect(lstatSync(join(kept, "alias.md")).isSymbolicLink()).toBe(true);
  });

  it("keeps nothing for links and empty folders", async () => {
    const outside = makeSkill(join(world.root, "elsewhere"), "linked");
    mkdirSync(claude, { recursive: true });
    symlinkSync(outside, join(claude, "linked"), "dir");
    mkdirSync(join(claude, "empty"));
    expect(await workspace().deleteLocal("claude_code", "linked")).toEqual([]);
    expect(await workspace().deleteBroken("claude_code", "empty")).toEqual([]);
    expect(existsSync(join(claude, "empty"))).toBe(false);
    expect(await storage.api.removed()).toEqual([]);

    writeFile(join(claude, "half-deleted", "notes.md"), "notes");
    expect(await workspace().deleteBroken("claude_code", "half-deleted")).toHaveLength(1);
  });

  it("replaces a link deployment on restore and drops its row", async () => {
    const local = makeSkill(claude, "alpha", { body: "mine" });
    const [id] = await workspace().deleteLocal("claude_code", "alpha");
    const skill = world.addSkill("alpha");
    await world.deploy.api.deploy(skill.id, "claude_code");
    expect(isLink(local)).toBe(true);
    expect((await storage.api.removed())[0]?.occupied).toBe(true);

    const restored = await storage.api.restoreRemoved(id ?? "");
    expect(restored.displacedId).toBeNull();
    expect(lstatSync(local).isDirectory()).toBe(true);
    expect(skillText(local)).toContain("mine");
    expect(world.store.deployment(skill.id, "claude_code")).toBeNull();
    // The library skill itself is untouched.
    expect(existsSync(join(skill.libraryPath, "SKILL.md"))).toBe(true);
  });

  it("refuses to restore into a folder that is gone, or over a file", async () => {
    const project = join(world.root, "work", "repo", ".claude", "skills");
    makeSkill(project, "gone");
    const id = world.removed.setAside(join(project, "gone"), { place: "repo", reason: "deleted" });
    rmSync(project, { recursive: true });
    const [entry] = await storage.api.removed();
    expect(entry?.parentMissing).toBe(true);
    expect((await rejection(storage.api.restoreRemoved(id ?? ""))).code).toBe("NOT_FOUND");

    const blocked = makeSkill(claude, "blocked");
    const second = world.removed.setAside(blocked, { place: "Claude Code", reason: "deleted" });
    writeFileSync(blocked, "a file now");
    expect((await rejection(storage.api.restoreRemoved(second ?? ""))).code).toBe("ALREADY_EXISTS");
  });

  it("refuses ids that are not entries", async () => {
    for (const id of ["../skills", "nope", "00000000-0000-4000-8000-000000000000"]) {
      expect((await rejection(storage.api.restoreRemoved(id))).code).toBe("NOT_FOUND");
      expect((await rejection(storage.api.deleteRemoved(id))).code).toBe("NOT_FOUND");
    }
  });

  it("forgets entries after the keep period, and on delete or clear", async () => {
    const old = world.removed.setAside(makeSkill(claude, "old"), {
      place: "Claude Code",
      reason: "deleted",
    });
    const metaPath = join(world.ctx.paths.removedDir, old ?? "", "removed.json");
    const meta = JSON.parse(readFileSync(metaPath, "utf8")) as { removedAt: number };
    writeFileSync(metaPath, JSON.stringify({ ...meta, removedAt: Date.now() - 31 * DAY_MS }));
    expect(await storage.api.removed()).toEqual([]);
    expect(existsSync(join(world.ctx.paths.removedDir, old ?? ""))).toBe(false);

    const one = world.removed.setAside(makeSkill(claude, "one"), { place: "x", reason: "deleted" });
    world.removed.setAside(makeSkill(claude, "two"), { place: "x", reason: "deleted" });
    await storage.api.deleteRemoved(one ?? "");
    expect((await storage.api.removed()).map((entry) => entry.name)).toEqual(["two"]);

    const report = await storage.api.report();
    expect(report.entries.find((entry) => entry.area === "removed")).toMatchObject({
      clearable: true,
      exists: true,
    });
    expect(await storage.api.clear("removed")).toBeGreaterThan(0);
    expect(await storage.api.removed()).toEqual([]);
  });

  it("keeps project copies a pull or delete takes away, named by project and agent", async () => {
    const repo = join(world.root, "work", "repo");
    mkdirSync(repo, { recursive: true });
    const project = await world.projects.api.add(repo);
    const projectClaude = join(repo, ".claude", "skills");
    const skill = world.addSkill("alpha");
    makeSkill(projectClaude, "alpha", { body: "project edit" });

    const pulled = await world.projects.api.pullFromLibrary(project.id, "alpha");
    expect(pulled).toHaveLength(1);
    expect(skillText(join(projectClaude, "alpha"))).toBe(skillText(skill.libraryPath));
    const [entry] = await storage.api.removed();
    expect(entry).toMatchObject({ place: `${project.name} · Claude Code`, reason: "replaced" });

    const deleted = await world.projects.api.deleteSkill(project.id, "alpha");
    expect(deleted).toHaveLength(1);
    expect(existsSync(join(projectClaude, "alpha"))).toBe(false);
    expect((await storage.api.removed()).map((item) => item.reason).sort()).toEqual([
      "deleted",
      "replaced",
    ]);
  });

  const deployWithRemoved = () =>
    createDeployService(world.ctx, {
      store: world.store,
      registry: world.registry,
      removed: world.removed,
    });

  describe("copies the app deployed", () => {
    it("keeps an edited copy that is removed or overwritten, and nothing for a clean one", async () => {
      world.ctx.settings.set("deployMode", "copy");
      const deploy = deployWithRemoved();
      const skill = world.addSkill("alpha");
      const clean = world.addSkill("beta");
      await deploy.api.apply([skill.id, clean.id], ["claude_code"], "add");
      await deploy.api.undeploy(clean.id, "claude_code");
      expect(await storage.api.removed()).toEqual([]);

      const copy = join(claude, "alpha");
      writeFile(join(copy, "SKILL.md"), "---\nname: alpha\ndescription: tuned here\n---\n");
      writeFile(join(skill.libraryPath, "new.txt"), "fresh");
      await deploy.refreshCopies(world.rehash(skill));
      expect(readFileSync(join(copy, "new.txt"), "utf8")).toBe("fresh");
      const [replaced] = await storage.api.removed();
      expect(replaced).toMatchObject({ reason: "replaced", place: "Claude Code", occupied: true });

      writeFile(join(copy, "notes.md"), "second edit");
      await deploy.api.undeploy(skill.id, "claude_code");
      expect(existsSync(copy)).toBe(false);
      expect((await storage.api.removed()).map((entry) => entry.reason).sort()).toEqual([
        "deleted",
        "replaced",
      ]);
    });

    it("puts the edited copy back when the new one cannot be written", async () => {
      world.ctx.settings.set("deployMode", "copy");
      const deploy = deployWithRemoved();
      const skill = world.addSkill("alpha");
      await deploy.api.deploy(skill.id, "claude_code");
      const copy = join(claude, "alpha");
      writeFile(join(copy, "notes.md"), "mine");
      writeFile(join(skill.libraryPath, "new.txt"), "fresh");
      const updated = world.rehash(skill);
      rmSync(skill.libraryPath, { recursive: true });

      const report = await deploy.refreshCopies(updated);
      expect(report.failed).toHaveLength(1);
      expect(readFileSync(join(copy, "notes.md"), "utf8")).toBe("mine");
      expect(await storage.api.removed()).toEqual([]);
    });

    it("restores an overwritten copy as the user's own folder, not a deployment", async () => {
      world.ctx.settings.set("deployMode", "copy");
      const deploy = deployWithRemoved();
      const skill = world.addSkill("alpha");
      await deploy.api.deploy(skill.id, "claude_code");
      const copy = join(claude, "alpha");
      writeFile(join(copy, "notes.md"), "mine");
      writeFile(join(skill.libraryPath, "new.txt"), "fresh");
      await deploy.refreshCopies(world.rehash(skill));
      const [entry] = await storage.api.removed();

      const restored = await storage.api.restoreRemoved(entry?.id ?? "");
      expect(restored.displacedId).toBeNull();
      expect(readFileSync(join(copy, "notes.md"), "utf8")).toBe("mine");
      expect(existsSync(join(copy, "new.txt"))).toBe(false);
      expect(world.store.deployment(skill.id, "claude_code")).toBeNull();
      // Nothing later treats it as a stale copy to replace.
      await deploy.refreshCopies(world.store.get(skill.id));
      expect(readFileSync(join(copy, "notes.md"), "utf8")).toBe("mine");
    });

    it("brings agents' copies back to a library version put back, keeping edited ones", async () => {
      world.ctx.settings.set("deployMode", "copy");
      const skill = world.addSkill("alpha");
      await world.deploy.api.deploy(skill.id, "claude_code");
      await world.deploy.api.deploy(skill.id, "cursor");
      // An update: the old version is kept, the library and the copies move on.
      world.removed.keepCopy(skill.libraryPath, { place: LIBRARY_PLACE, reason: "replaced" });
      writeFile(join(skill.libraryPath, "new.txt"), "fresh");
      await world.deploy.refreshCopies(world.rehash(skill));
      const copy = join(claude, "alpha");
      const edited = join(world.home, ".cursor", "skills", "alpha");
      expect(readFileSync(join(copy, "new.txt"), "utf8")).toBe("fresh");
      writeFile(join(edited, "notes.md"), "mine");

      const [entry] = await storage.api.removed();
      await storage.api.restoreRemoved(entry?.id ?? "");
      expect(existsSync(join(skill.libraryPath, "new.txt"))).toBe(false);
      expect(existsSync(join(copy, "new.txt"))).toBe(false);
      const restored = world.store.get(skill.id);
      expect(world.store.deployment(skill.id, "claude_code")?.sourceHash).toBe(
        restored.contentHash,
      );
      expect(readFileSync(join(edited, "notes.md"), "utf8")).toBe("mine");
    });

    it("keeps the current library version in Recently removed when an older one is put back", async () => {
      const skill = world.addSkill("alpha");
      world.removed.keepCopy(skill.libraryPath, { place: LIBRARY_PLACE, reason: "replaced" });
      writeFile(join(skill.libraryPath, "new.txt"), "current work");
      world.rehash(skill);

      const [older] = await storage.api.removed();
      const result = await storage.api.restoreRemoved(older?.id ?? "");
      expect(existsSync(join(skill.libraryPath, "new.txt"))).toBe(false);
      expect(result.displacedId).not.toBeNull();

      // Undo: the version that was current comes back.
      await storage.api.restoreRemoved(result.displacedId ?? "");
      expect(readFileSync(join(skill.libraryPath, "new.txt"), "utf8")).toBe("current work");
    });
  });

  it("clears a half-written entry only once it is surely abandoned", async () => {
    const half = join(world.ctx.paths.removedDir, "11111111-1111-4111-8111-111111111111");
    writeFile(join(half, "content", "SKILL.md"), "partly copied");
    expect(await storage.api.removed()).toEqual([]);
    expect(existsSync(half)).toBe(true);
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(half, old, old);
    await storage.api.removed();
    expect(existsSync(half)).toBe(false);
  });
});
