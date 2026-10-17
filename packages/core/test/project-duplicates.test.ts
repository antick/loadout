import type * as fs from "node:fs";
import { createProjectDuplicateActions } from "../src/projects/duplicates";
import { installIntoLibrary } from "../src/install/library";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSkill, writeFile } from "./helpers";
import { createWorkspaceWorld, type WorkspaceWorld } from "./workspace-world";

const linkFailure = { at: 0, calls: 0 };
vi.mock("node:fs", async (original) => {
  const actual = await original<typeof fs>();
  return {
    ...actual,
    symlinkSync: (...args: Parameters<typeof actual.symlinkSync>) => {
      if (linkFailure.at && ++linkFailure.calls === linkFailure.at)
        throw new Error("links unavailable");
      return actual.symlinkSync(...args);
    },
  };
});

const SKILL = "review";
const ROOTS = [".agents/skills", ".claude/skills", ".cursor/skills"];
describe("resolving project duplicate copies", () => {
  let world: WorkspaceWorld;
  let repo: string;
  let id: string;
  let copies: string[];
  const api = () => world.projects.api;
  beforeEach(async () => {
    world = createWorkspaceWorld();
    world.installAgents(".claude", ".cursor", ".codex");
    repo = join(world.root, "repo");
    mkdirSync(repo);
    copies = ROOTS.map((root) => makeSkill(join(repo, root), SKILL));
    id = (await api().add(repo)).id;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    linkFailure.at = 0;
    linkFailure.calls = 0;
    world.cleanup();
  });

  it("previews without writing, shares identical copies, and restores them with Undo", async () => {
    const plan = await api().previewDuplicates(id, SKILL);
    expect(plan.status).toBe("identical");
    expect(plan.canonicalPath).toBe(copies[0]);
    expect(copies.every((copyPath) => !lstatSync(copyPath).isSymbolicLink())).toBe(true);
    await api().resolveDuplicates(id, SKILL, plan.token);
    expect(new Set(copies.map((path) => realpathSync(path))).size).toBe(1);
    expect(world.removed.list()).toHaveLength(2);
    expect((await api().skills(id)).flatMap((skill) => skill.duplicates)).toEqual([]);
    expect((await api().previewDuplicates(id, SKILL)).canUndo).toBe(true);
    await api().undoDuplicates(id, SKILL);
    expect(copies.every((copyPath) => !lstatSync(copyPath).isSymbolicLink())).toBe(true);
    expect((await api().previewDuplicates(id, SKILL)).status).toBe("identical");
  });

  it.each([0, 1])(
    "preserves existing links to copy %i through resolution and Undo",
    async (targetIndex) => {
      const link = join(repo, ".pi/skills", SKILL);
      mkdirSync(dirname(link), { recursive: true });
      const target = relative(dirname(link), copies[targetIndex]!);
      symlinkSync(target, link, "dir");
      const plan = await api().previewDuplicates(id, SKILL);
      expect(plan.status).toBe("identical");
      expect(plan.copies).toHaveLength(3);
      expect(plan.links).toEqual([{ path: link, targetPath: realpathSync(copies[targetIndex]!) }]);
      const inode = lstatSync(link).ino;
      await api().resolveDuplicates(id, SKILL, plan.token);
      expect(realpathSync(link)).toBe(realpathSync(copies[0]!));
      expect(world.removed.list()).toHaveLength(2);
      await api().undoDuplicates(id, SKILL);
      expect(readlinkSync(link)).toBe(target);
      expect(lstatSync(link).ino).toBe(inode);
      expect(realpathSync(link)).toBe(realpathSync(copies[targetIndex]!));
    },
  );

  it("does not call existing links duplicates when all locations already share one folder", async () => {
    for (const path of copies.slice(1)) {
      rmSync(path, { recursive: true });
      symlinkSync(relative(dirname(path), copies[0]!), path, "dir");
    }
    const plan = await api().previewDuplicates(id, SKILL);
    expect(plan.status).toBe("none");
    expect(plan.links).toHaveLength(2);
    expect(world.removed.list()).toHaveLength(0);
  });

  it("refuses a changed link after preview without modifying copies", async () => {
    const link = copies.pop()!;
    rmSync(link, { recursive: true });
    symlinkSync(copies[0]!, link, "dir");
    const plan = await api().previewDuplicates(id, SKILL);
    rmSync(link);
    symlinkSync(copies[1]!, link, "dir");
    await expect(api().resolveDuplicates(id, SKILL, plan.token)).rejects.toThrow(/changed/);
    expect(world.removed.list()).toHaveLength(0);
    expect(copies.every((path) => lstatSync(path).isDirectory())).toBe(true);
  });

  it("names external linked folders and leaves them untouched", async () => {
    const external = makeSkill(join(world.root, "external"), SKILL);
    rmSync(copies[2]!, { recursive: true });
    symlinkSync(external, copies[2]!, "dir");
    const plan = await api().previewDuplicates(id, SKILL);
    expect(plan.status).toBe("unsupported");
    expect(plan.reason).toContain(copies[2]);
    expect(plan.reason).toContain(external);
    expect(plan.reason).toContain("Nothing has been changed");
    expect(existsSync(join(external, "SKILL.md"))).toBe(true);
  });

  it("names the nested Git folder that prevents safe replacement", async () => {
    const git = join(copies[1]!, ".git");
    mkdirSync(git);
    const plan = await api().previewDuplicates(id, SKILL);
    expect(plan.status).toBe("unsupported");
    expect(plan.reason).toContain(git);
    expect(plan.reason).toContain("version history");
  });

  it("compares supporting and hidden files, and refuses different copies", async () => {
    writeFile(join(copies[1]!, ".hidden"), "unique content");
    const plan = await api().previewDuplicates(id, SKILL);
    expect(plan.status).toBe("different");
    expect(plan.copies.flatMap((copy) => copy.files.map((file) => file.path))).toContain(".hidden");
    await expect(api().resolveDuplicates(id, SKILL, plan.token)).rejects.toThrow();
    expect(readFileSync(join(copies[1]!, ".hidden"), "utf8")).toBe("unique content");
  });

  it("rejects a stale preview even when a file is changed back to its old contents", async () => {
    const plan = await api().previewDuplicates(id, SKILL);
    const path = join(copies[1]!, "SKILL.md");
    const original = readFileSync(path);
    writeFile(path, "changed");
    writeFile(path, original.toString());
    await expect(api().resolveDuplicates(id, SKILL, plan.token)).rejects.toThrow(/changed/);
    expect(copies.every((copyPath) => !lstatSync(copyPath).isSymbolicLink())).toBe(true);
  });

  it("does not discard edits through a shared link when Undo is requested", async () => {
    const plan = await api().previewDuplicates(id, SKILL);
    await api().resolveDuplicates(id, SKILL, plan.token);
    writeFile(join(copies[1]!, "notes.md"), "new work");
    await expect(api().undoDuplicates(id, SKILL)).rejects.toThrow(/changed/);
    expect(readFileSync(join(copies[0]!, "notes.md"), "utf8")).toBe("new work");
    expect(world.removed.list()).toHaveLength(2);
  });

  it("leaves nested links and external data alone", async () => {
    const outside = join(world.root, "outside");
    writeFile(outside, "keep");
    symlinkSync(outside, join(copies[1]!, "linked"));
    const plan = await api().previewDuplicates(id, SKILL);
    expect(plan.status).toBe("unsupported");
    expect(plan.reason).toContain(join(copies[1]!, "linked"));
    expect(plan.reason).toContain("link inside a skill");
    expect(readFileSync(outside, "utf8")).toBe("keep");
  });

  it("keeps shared paths readable when disabled and re-enabled", async () => {
    const plan = await api().previewDuplicates(id, SKILL);
    await api().resolveDuplicates(id, SKILL, plan.token);
    await api().setSkillEnabled(id, SKILL, false);
    const off = copies.map((path) => join(dirname(dirname(path)), "skills-disabled", SKILL));
    expect(off.every((path) => existsSync(join(path, "SKILL.md")))).toBe(true);
    await api().setSkillEnabled(id, SKILL, true);
    expect(copies.every((path) => existsSync(join(path, "SKILL.md")))).toBe(true);
    await api().undoDuplicates(id, SKILL);
  });

  it("preserves other agents' skills when the canonical copy is removed", async () => {
    const plan = await api().previewDuplicates(id, SKILL);
    await api().resolveDuplicates(id, SKILL, plan.token);
    await api().deleteSkill(id, SKILL, "codex");
    expect(existsSync(copies[0]!)).toBe(false);
    expect(copies.slice(1).every((path) => existsSync(join(path, "SKILL.md")))).toBe(true);
  });
  it("rolls every copy back when link creation fails halfway through", async () => {
    const plan = await api().previewDuplicates(id, SKILL);
    linkFailure.at = 2;
    await expect(api().resolveDuplicates(id, SKILL, plan.token)).rejects.toThrow(/restored/);
    expect(
      copies.every(
        (path) => existsSync(join(path, "SKILL.md")) && !lstatSync(path).isSymbolicLink(),
      ),
    ).toBe(true);
    expect((await api().previewDuplicates(id, SKILL)).canUndo).toBe(false);
  });

  it("can undo from a freshly constructed service using the persisted recovery record", async () => {
    const plan = await api().previewDuplicates(id, SKILL);
    await api().resolveDuplicates(id, SKILL, plan.token);
    const actions = createProjectDuplicateActions(world.ctx, {
      ...world,
      install: {
        installIntoLibrary: (request) => installIntoLibrary(world.ctx, world.store, request),
      },
    });
    await actions.undo(world.projects.projects.get(id), SKILL);
    expect(copies.every((copyPath) => !lstatSync(copyPath).isSymbolicLink())).toBe(true);
  });

  it("leaves the shared layout intact if a recovery backup is missing", async () => {
    const plan = await api().previewDuplicates(id, SKILL);
    await api().resolveDuplicates(id, SKILL, plan.token);
    world.removed.remove(world.removed.list()[0]!.id);
    expect((await api().previewDuplicates(id, SKILL)).canUndo).toBe(false);
    await expect(api().undoDuplicates(id, SKILL)).rejects.toThrow();
    expect(new Set(copies.map((path) => realpathSync(path))).size).toBe(1);
  });

  it("does not partially disable a shared skill when links are unsupported", async () => {
    const plan = await api().previewDuplicates(id, SKILL);
    await api().resolveDuplicates(id, SKILL, plan.token);
    linkFailure.at = 1;
    await expect(api().setSkillEnabled(id, SKILL, false)).rejects.toThrow();
    expect(copies.every((path) => existsSync(join(path, "SKILL.md")))).toBe(true);
  });
  it("recovers an interrupted resolution from its saved journal", async () => {
    const plan = await api().previewDuplicates(id, SKILL);
    linkFailure.at = 2;
    vi.spyOn(world.removed, "putBack").mockImplementationOnce(() => {
      throw new Error("restore interrupted");
    });
    await expect(api().resolveDuplicates(id, SKILL, plan.token)).rejects.toThrow(/Recovery/);
    expect((await api().previewDuplicates(id, SKILL)).canUndo).toBe(true);
    await api().undoDuplicates(id, SKILL);
    expect(
      copies.every(
        (path) => existsSync(join(path, "SKILL.md")) && !lstatSync(path).isSymbolicLink(),
      ),
    ).toBe(true);
  });

  it("keeps a working link when Undo cannot restore its backup", async () => {
    const plan = await api().previewDuplicates(id, SKILL);
    await api().resolveDuplicates(id, SKILL, plan.token);
    vi.spyOn(world.removed, "putBack").mockImplementationOnce(() => {
      throw new Error("disk unavailable");
    });
    await expect(api().undoDuplicates(id, SKILL)).rejects.toThrow(/disk unavailable/);
    expect(copies.every((path) => existsSync(join(path, "SKILL.md")))).toBe(true);
    await api().undoDuplicates(id, SKILL);
  });
});
