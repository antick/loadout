import { existsSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import type { Skill } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { INTERNAL_KEYS } from "../src/settings/store";
import { makeSkill, writeFile } from "./helpers";
import {
  type WorkspaceWorld,
  createWorkspaceWorld,
  isLink,
  rejection,
  setContentMtime,
} from "./workspace-world";

const T0 = Date.UTC(2026, 0, 1);
const MINUTE = 60_000;
const SHARED_DIR = join(".agents", "skills");

describe("projects", () => {
  let world: WorkspaceWorld;
  let repo: string;
  let claude: string;
  let claudeOff: string;
  const api = () => world.projects.api;

  beforeEach(() => {
    world = createWorkspaceWorld();
    world.installAgents(".claude", ".cursor", ".warp");
    repo = join(world.root, "work", "repo");
    mkdirSync(repo, { recursive: true });
    claude = join(repo, ".claude", "skills");
    claudeOff = join(repo, ".claude", "skills-disabled");
  });
  afterEach(() => world.cleanup());

  /** A library skill plus a project copy of it that was edited `offsetMs` after the library. */
  function editedCopy(skill: Skill, root: string, offsetMs: number, body = "edited"): string {
    const local = makeSkill(root, skill.dirName, { body });
    setContentMtime(skill.libraryPath, T0);
    setContentMtime(local, T0 + offsetMs);
    return local;
  }

  describe("watching", () => {
    it("lists each workspace's skills folders, parking folders included, once each", async () => {
      await api().add(repo);
      const folders = world.projects.skillFolders();
      expect(folders).toContain(claude);
      expect(folders).toContain(claudeOff);
      expect(new Set(folders).size).toBe(folders.length);
    });
  });

  describe("saving workspaces", () => {
    it("adds an existing folder, prepares the default agent's folders, and lists it last", async () => {
      const first = await api().add(repo);
      expect(first).toMatchObject({
        name: "repo",
        path: repo,
        type: "project",
        supportsToggle: true,
        skillCount: 0,
        missing: false,
      });
      expect(existsSync(claude)).toBe(true);
      expect(existsSync(claudeOff)).toBe(true);

      const other = join(world.root, "work", "other");
      mkdirSync(other);
      const second = await api().add(other);
      expect((await api().list()).map((p) => p.name)).toEqual(["repo", "other"]);
      await api().reorder([second.id, first.id]);
      expect((await api().list()).map((p) => p.name)).toEqual(["other", "repo"]);
    });

    it("refuses a missing folder and a folder that is already saved", async () => {
      expect((await rejection(api().add(join(world.root, "nope")))).code).toBe("NOT_FOUND");
      expect((await rejection(api().add("relative/path"))).code).toBe("INVALID_INPUT");
      await api().add(repo);
      expect((await rejection(api().add(repo))).code).toBe("ALREADY_EXISTS");
      const alias = join(world.root, "alias");
      symlinkSync(repo, alias, "dir");
      expect((await rejection(api().add(alias))).code).toBe("ALREADY_EXISTS");
    });

    it("removes only the saved entry and flags a folder that went away", async () => {
      const project = await api().add(repo);
      makeSkill(claude, "kept");
      await api().setLastExportAgents(project.id, ["cursor"]);
      await api().remove(project.id);
      expect(await api().list()).toEqual([]);
      expect(existsSync(join(claude, "kept"))).toBe(true);
      expect(world.ctx.settings.getRaw(INTERNAL_KEYS.projectExportAgents(project.id), null)).toBe(
        null,
      );

      const gone = join(world.root, "work", "gone");
      mkdirSync(gone);
      const saved = await api().add(gone);
      rmSync(gone, { recursive: true });
      expect((await api().list()).find((p) => p.id === saved.id)).toMatchObject({
        missing: true,
        skillCount: 0,
      });
    });

    it("finds projects by any agent's project folder, four levels down at most", async () => {
      const root = join(world.root, "scan");
      const dirs = [
        join(root, "a", ".claude", "skills"),
        join(root, "a", "inner", ".cursor", "skills"),
        join(root, "group", "b", ".opencode", "skills"),
        join(root, "group", "c", ".agents", "skills"),
        join(root, "1", "2", "3", "deep", ".claude", "skills"),
        join(root, "1", "2", "3", "4", "too-deep", ".claude", "skills"),
        join(root, "node_modules", "pkg", ".claude", "skills"),
        join(root, ".hidden", "x", ".claude", "skills"),
        join(root, "plain", "src"),
      ];
      for (const dir of dirs) mkdirSync(dir, { recursive: true });
      expect(await api().scan(root)).toEqual([
        join(root, "1", "2", "3", "deep"),
        join(root, "a"),
        join(root, "group", "b"),
        join(root, "group", "c"),
      ]);
    });
  });

  describe("targets", () => {
    it("merges agents that share a project folder into one target", async () => {
      const project = await api().add(repo);
      const targets = await api().targets(project.id);
      const shared = targets.filter((t) => t.relativeDir === ".agents/skills");
      expect(shared).toHaveLength(1);
      expect(shared[0]).toMatchObject({
        key: "cline",
        displayName: "Cline / Warp / GitLab Duo",
        agentKeys: ["cline", "warp", "gitlab_duo"],
        // Cline is not on this machine, Warp is: the shared folder is still worth using.
        installed: true,
        enabled: true,
      });
      expect(shared[0]).not.toHaveProperty("enabledRoot");

      expect(targets.find((t) => t.key === "opencode")?.relativeDir).toBe(".opencode/skills");
      expect(targets.find((t) => t.key === "codex")).toMatchObject({ installed: false });
      expect(new Set(targets.map((t) => t.relativeDir)).size).toBe(targets.length);
    });

    it("leaves out agents without a project folder and keeps the key when agents are reordered", async () => {
      const project = await api().add(repo);
      await world.agents.api.addCustom({ displayName: "No Projects", skillsDir: "~/np/skills" });
      await world.agents.api.addCustom({
        displayName: "Shares",
        skillsDir: "~/sh/skills",
        projectSkillsDir: ".agents/skills/",
      });
      await world.agents.api.setOrder(["warp", "shares", "cline"]);
      const targets = await api().targets(project.id);
      expect(targets.some((t) => t.agentKeys.includes("no_projects"))).toBe(false);
      expect(targets.find((t) => t.relativeDir === ".agents/skills")).toMatchObject({
        key: "cline",
        agentKeys: ["cline", "warp", "gitlab_duo", "shares"],
      });
    });
  });

  describe("skills", () => {
    it("lists both sides of every target in depth, matched loosely, never managed", async () => {
      const project = await api().add(repo);
      const review = world.addSkill("code-review");
      world.store.setTags(review.id, ["quality"]);
      editedCopy(review, claude, MINUTE);
      makeSkill(join(claude, "research"), "web-search");
      makeSkill(claudeOff, "parked");
      makeSkill(join(repo, SHARED_DIR), "shared-one");

      const skills = await api().skills(project.id);
      expect(
        skills.map((s) => [s.relativePath, s.agentKey, s.enabled, s.syncStatus, s.managed]),
      ).toEqual([
        ["code-review", "claude_code", true, "local_newer", false],
        ["parked", "claude_code", false, "local_only", false],
        ["shared-one", "cline", true, "local_only", false],
        ["research/web-search", "claude_code", true, "local_only", false],
      ]);
      expect(skills[0]).toMatchObject({ librarySkillId: review.id, tags: ["quality"] });
      expect(skills[2]?.agentDisplayName).toBe("Cline / Warp / GitLab Duo");
    });

    it("counts skills by relative path and reports the worst status of each", async () => {
      const project = await api().add(repo);
      const a = world.addSkill("a");
      const b = world.addSkill("b");
      // `a`: one copy in sync, one diverged → diverged. `b`: in sync. `c`: only here.
      makeSkill(claude, "a");
      editedCopy(a, join(repo, ".cursor", "skills"), 0);
      // Same content as the library's `b`, under a folder name that differs only in case.
      makeSkill(join(repo, ".cursor", "skills"), "B", { name: "b", description: "Test skill b" });
      makeSkill(claudeOff, "c");

      const listed = (await api().list()).find((p) => p.id === project.id);
      expect(listed?.skillCount).toBe(3);
      expect(listed?.syncHealth).toEqual({
        in_sync: 1,
        local_only: 1,
        library_newer: 0,
        local_newer: 0,
        diverged: 1,
      });
      const copyOfB = (await api().skills(project.id)).find((s) => s.dirName === "B");
      expect(copyOfB?.librarySkillId).toBe(b.id);
    });

    it("reads a document from either side, through the merged target's member keys", async () => {
      const project = await api().add(repo);
      makeSkill(claudeOff, "parked", { body: "parked text" });
      makeSkill(join(repo, SHARED_DIR), "shared-one", { body: "shared text" });
      expect((await api().document(project.id, "parked", "claude_code")).content).toContain(
        "parked text",
      );
      expect((await api().document(project.id, "shared-one", "warp")).content).toContain(
        "shared text",
      );
      expect((await rejection(api().document(project.id, "parked", "nobody"))).code).toBe(
        "NOT_FOUND",
      );
      expect((await rejection(api().document(project.id, "../x", "claude_code"))).code).toBe(
        "INVALID_INPUT",
      );
    });
  });

  describe("linked workspaces", () => {
    let skillsRoot: string;

    beforeEach(() => {
      skillsRoot = join(world.root, "vault", "skills");
      mkdirSync(skillsRoot, { recursive: true });
    });

    it("links a skills root with a sibling disabled folder and one stand-in target", async () => {
      const project = await api().addLinked("  My Vault  ", skillsRoot);
      expect(project).toMatchObject({ name: "My Vault", type: "linked", supportsToggle: true });
      expect(existsSync(join(world.root, "vault", "skills-disabled"))).toBe(true);
      expect(await api().targets(project.id)).toEqual([
        {
          key: "my-vault",
          displayName: "My Vault",
          agentKeys: ["my-vault"],
          relativeDir: "",
          enabled: true,
          installed: true,
          isCustom: false,
        },
      ]);

      makeSkill(join(skillsRoot, "deep", "er"), "nested");
      const [found] = await api().skills(project.id);
      expect(found).toMatchObject({ relativePath: "deep/er/nested", agentKey: "my-vault" });

      await api().setSkillEnabled(project.id, "deep/er/nested", false);
      const parked = join(world.root, "vault", "skills-disabled", "deep", "er", "nested");
      expect(existsSync(parked)).toBe(true);
      await api().setSkillEnabled(project.id, "deep/er/nested", true);
      // The namespace folders are pruned; the disabled root the user relies on stays.
      expect(existsSync(join(world.root, "vault", "skills-disabled"))).toBe(true);
      expect(existsSync(join(world.root, "vault", "skills-disabled", "deep"))).toBe(false);

      const skill = world.addSkill("alpha");
      await api().exportSkill(skill.id, project.id, ["anything"]);
      expect(isLink(join(skillsRoot, "alpha"))).toBe(true);
    });

    it("validates the name and both folders", async () => {
      expect((await rejection(api().addLinked(" ", skillsRoot))).code).toBe("INVALID_INPUT");
      expect((await rejection(api().addLinked("X", join(world.root, "nope")))).code).toBe(
        "NOT_FOUND",
      );
      expect(
        (await rejection(api().addLinked("X", skillsRoot, join(world.root, "nope")))).code,
      ).toBe("NOT_FOUND");
      const inside = join(skillsRoot, "off");
      mkdirSync(inside);
      const overlap = await rejection(api().addLinked("X", skillsRoot, inside));
      expect(overlap.message).toBe(
        "The skills folder and the disabled skills folder must not overlap",
      );
      expect((await rejection(api().addLinked("X", skillsRoot, skillsRoot))).code).toBe(
        "INVALID_INPUT",
      );
      expect(await api().list()).toEqual([]);
    });

    it("cannot disable skills when no disabled folder could be made", async () => {
      // A file sits where the sibling folder would go.
      writeFile(join(world.root, "vault", "skills-disabled"), "not a folder");
      const project = await api().addLinked("Vault", skillsRoot);
      expect(project.supportsToggle).toBe(false);
      makeSkill(skillsRoot, "alpha");
      const error = await rejection(api().setSkillEnabled(project.id, "alpha", false));
      expect(error.code).toBe("UNSUPPORTED");
      expect(error.message).toBe("This workspace does not support disabling skills");
    });

    it("reveals the workspace folder through the host", async () => {
      const project = await api().addLinked("Vault", skillsRoot);
      const revealed: string[] = [];
      world.ctx.host.revealPath = async (path) => {
        revealed.push(path);
      };
      await api().reveal(project.id);
      expect(revealed).toEqual([skillsRoot]);
    });
  });
});
