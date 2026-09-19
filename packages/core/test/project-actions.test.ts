import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import type { Skill } from "@skillboard/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeSkill, writeFile } from "./helpers";
import {
  type WorkspaceWorld,
  createWorkspaceWorld,
  isLink,
  rejection,
  setContentMtime,
  skillText,
} from "./workspace-world";

const T0 = Date.UTC(2026, 0, 1);
const MINUTE = 60_000;
const SHARED_DIR = join(".agents", "skills");

describe("project actions", () => {
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

  describe("enable and disable", () => {
    it("moves every copy between the two folders and prunes the emptied disabled side", async () => {
      const project = await api().add(repo);
      const cursor = join(repo, ".cursor", "skills");
      makeSkill(join(claude, "research"), "web");
      makeSkill(join(cursor, "research"), "web");

      await api().setSkillEnabled(project.id, "research/web", false);
      expect(existsSync(join(claude, "research", "web"))).toBe(false);
      expect(existsSync(join(claudeOff, "research", "web", "SKILL.md"))).toBe(true);
      expect(existsSync(join(`${cursor}-disabled`, "research", "web", "SKILL.md"))).toBe(true);
      expect((await api().skills(project.id)).map((s) => s.enabled)).toEqual([false, false]);

      // Already disabled: nothing to do, no error.
      await api().setSkillEnabled(project.id, "research/web", false);

      await api().setSkillEnabled(project.id, "research/web", true);
      expect(existsSync(join(claude, "research", "web", "SKILL.md"))).toBe(true);
      expect(existsSync(join(cursor, "research", "web", "SKILL.md"))).toBe(true);
      expect(existsSync(claudeOff)).toBe(false);
      expect(existsSync(`${cursor}-disabled`)).toBe(false);
    });

    it("drops a duplicate on the other side only when it is a link", async () => {
      const project = await api().add(repo);
      const real = makeSkill(claude, "dup");
      mkdirSync(claudeOff, { recursive: true });
      symlinkSync(real, join(claudeOff, "dup"), "dir");
      await api().setSkillEnabled(project.id, "dup", true);
      expect(existsSync(join(claudeOff, "dup"))).toBe(false);
      expect(existsSync(join(real, "SKILL.md"))).toBe(true);

      makeSkill(claudeOff, "dup", { body: "a second real copy" });
      const error = await rejection(api().setSkillEnabled(project.id, "dup", true));
      expect(error.message).toBe("Duplicate skill entry is not a symlink — resolve manually");
      expect(existsSync(join(claudeOff, "dup", "SKILL.md"))).toBe(true);
    });

    it("refuses a missing skill and an occupied destination, moving nothing", async () => {
      const project = await api().add(repo);
      expect((await rejection(api().setSkillEnabled(project.id, "ghost", true))).message).toBe(
        "Skill directory not found in skills-disabled",
      );
      expect((await rejection(api().setSkillEnabled(project.id, "ghost", false))).message).toBe(
        "Skill directory not found",
      );

      const cursor = join(repo, ".cursor", "skills");
      makeSkill(claude, "busy");
      makeSkill(cursor, "busy");
      // Not a skill, so it is not a duplicate copy; it is simply in the way.
      writeFile(join(`${cursor}-disabled`, "busy", "notes.txt"), "in the way");
      const error = await rejection(api().setSkillEnabled(project.id, "busy", false));
      expect(error.code).toBe("ALREADY_EXISTS");
      expect(error.message).toBe("Skill already exists in skills-disabled directory");
      expect(existsSync(join(claude, "busy", "SKILL.md"))).toBe(true);
    });
  });

  describe("export", () => {
    it("exports to the default agent, as a link or a copy per the deploy mode", async () => {
      const project = await api().add(repo);
      const skill = world.addSkill("alpha");
      await api().exportSkill(skill.id, project.id);
      expect(isLink(join(claude, "alpha"))).toBe(true);

      world.ctx.settings.set("deployMode", "copy");
      const beta = world.addSkill("beta");
      await api().exportSkill(beta.id, project.id, ["cursor"]);
      const copy = join(repo, ".cursor", "skills", "beta");
      expect(isLink(copy)).toBe(false);
      expect(skillText(copy)).toBe(skillText(beta.libraryPath));
      // Project copies are never recorded as deployments.
      expect(world.store.deployments()).toEqual([]);
      const listed = (await api().skills(project.id)).map((s) => [s.relativePath, s.syncStatus]);
      expect(listed).toEqual([
        ["alpha", "in_sync"],
        ["beta", "in_sync"],
      ]);
    });

    it("writes once for keys that share a folder and ignores agents that cannot be used", async () => {
      const project = await api().add(repo);
      const skill = world.addSkill("alpha");
      await api().exportSkill(skill.id, project.id, ["warp", "gitlab_duo", "codex"]);
      expect(existsSync(join(repo, SHARED_DIR, "alpha", "SKILL.md"))).toBe(true);
      expect(existsSync(join(repo, ".codex"))).toBe(false);

      const error = await rejection(api().exportSkill(skill.id, project.id, ["codex"]));
      expect(error.message).toBe("No enabled installed agents selected for this project");
    });

    it("writes nothing when any chosen target already has the skill, on either side", async () => {
      const project = await api().add(repo);
      const skill = world.addSkill("alpha");
      makeSkill(join(repo, ".cursor", "skills-disabled"), "alpha", { body: "parked" });
      const error = await rejection(
        api().exportSkill(skill.id, project.id, ["claude_code", "cursor"]),
      );
      expect(error.code).toBe("ALREADY_EXISTS");
      expect(error.message).toBe('Skill "alpha" already exists in this workspace for agent cursor');
      expect(existsSync(join(claude, "alpha"))).toBe(false);
    });

    it("remembers the last export choice, filtered to targets that can still be used", async () => {
      const project = await api().add(repo);
      expect(await api().lastExportAgents(project.id)).toEqual([]);
      await api().setLastExportAgents(project.id, ["cursor", "codex", "warp", "cursor"]);
      expect(await api().lastExportAgents(project.id)).toEqual(["cursor", "warp"]);
      expect((await rejection(api().setLastExportAgents("nope", []))).code).toBe("NOT_FOUND");
    });
  });

  describe("push to the library", () => {
    it("refuses when more than one copy may hold content of its own", async () => {
      const project = await api().add(repo);
      const skill = world.addSkill("alpha");
      editedCopy(skill, claude, MINUTE, "claude edit");
      editedCopy(skill, join(repo, ".cursor", "skills"), -MINUTE, "cursor edit");

      const result = await api().pushToLibrary(project.id, "alpha");
      expect(result).toEqual({ conflictingVariants: 2, realignFailed: 0 });
      expect(world.store.get(skill.id).contentHash).toBe(skill.contentHash);
      expect(skillText(join(claude, "alpha"))).toContain("claude edit");
    });

    it("pushes the one changed copy over its match and realigns the rest", async () => {
      world.ctx.settings.set("deployMode", "copy");
      const project = await api().add(repo);
      const skill = world.addSkill("alpha");
      await api().exportSkill(skill.id, project.id, ["claude_code", "cursor"]);
      await world.deploy.api.deploy(skill.id, "claude_code");
      writeFile(join(claude, "alpha", "SKILL.md"), "---\nname: alpha\n---\nversion two\n");
      setContentMtime(skill.libraryPath, T0);
      setContentMtime(join(claude, "alpha"), T0 + MINUTE);

      const result = await api().pushToLibrary(project.id, "alpha");
      expect(result).toEqual({ conflictingVariants: 0, realignFailed: 0 });
      const updated = world.store.get(skill.id);
      expect(updated.updateStatus).toBe("local_only");
      expect(skillText(updated.libraryPath)).toContain("version two");
      expect(skillText(join(repo, ".cursor", "skills", "alpha"))).toContain("version two");
      // The agent's deployed copy follows the library too.
      expect(skillText(join(world.home, ".claude", "skills", "alpha"))).toContain("version two");
      expect((await api().skills(project.id)).map((s) => s.syncStatus)).toEqual([
        "in_sync",
        "in_sync",
      ]);
    });

    it("pushes an unknown skill as a new library skill with no deployment and no preset", async () => {
      const project = await api().add(repo);
      const local = makeSkill(join(claude, "research"), "web", { body: "found on the web" });
      const result = await api().pushToLibrary(project.id, "research/web");
      expect(result).toEqual({ conflictingVariants: 0, realignFailed: 0 });
      const [skill] = world.store.list();
      expect(skill).toMatchObject({
        name: "web",
        sourceType: "local",
        sourceRef: local,
        deployments: [],
        presetIds: [],
      });
      // The project copy stays a real folder: nothing in a project is adopted.
      expect(isLink(local)).toBe(false);
      expect((await rejection(api().pushToLibrary(project.id, "ghost"))).code).toBe("NOT_FOUND");
    });
  });

  describe("pull from the library", () => {
    it("replaces every copy, newer ones included, and never writes through a link", async () => {
      const project = await api().add(repo);
      const skill = world.addSkill("alpha");
      const newer = editedCopy(skill, claude, MINUTE, "newer than the library");
      const parked = makeSkill(join(repo, ".cursor", "skills-disabled"), "alpha", {
        body: "parked and stale",
      });
      const elsewhere = makeSkill(join(world.root, "elsewhere"), "alpha", { body: "foreign" });
      mkdirSync(join(repo, SHARED_DIR), { recursive: true });
      const link = join(repo, SHARED_DIR, "alpha");
      symlinkSync(elsewhere, link, "dir");

      await api().pullFromLibrary(project.id, "alpha");
      const expected = skillText(skill.libraryPath);
      expect(skillText(newer)).toBe(expected);
      expect(skillText(parked)).toBe(expected);
      // The foreign link was re-pointed, not written through.
      expect(isLink(link)).toBe(true);
      expect(skillText(link)).toBe(expected);
      expect(skillText(elsewhere)).toContain("foreign");
      expect(world.store.get(skill.id).contentHash).toBe(skill.contentHash);
    });

    it("refuses a skill the library does not have", async () => {
      const project = await api().add(repo);
      makeSkill(claude, "solo");
      expect((await rejection(api().pullFromLibrary(project.id, "solo"))).message).toBe(
        "This skill is not in the library",
      );
    });
  });

  describe("delete", () => {
    it("deletes one agent's copy or every copy, on either side", async () => {
      const project = await api().add(repo);
      const cursor = join(repo, ".cursor", "skills");
      makeSkill(claude, "alpha");
      makeSkill(cursor, "alpha");
      makeSkill(join(repo, SHARED_DIR), "Alpha");
      makeSkill(join(claudeOff, "group"), "parked");

      await api().deleteSkill(project.id, "alpha", "cursor");
      expect(existsSync(join(cursor, "alpha"))).toBe(false);
      expect(existsSync(join(claude, "alpha"))).toBe(true);

      await api().deleteSkill(project.id, "alpha");
      expect(existsSync(join(claude, "alpha"))).toBe(false);
      expect(existsSync(join(repo, SHARED_DIR, "Alpha"))).toBe(false);

      await api().deleteSkill(project.id, "group/parked", "claude_code");
      expect(existsSync(claudeOff)).toBe(false);
      expect((await rejection(api().deleteSkill(project.id, "alpha"))).code).toBe("NOT_FOUND");
      // A namespace folder is not a skill and is never deleted as one.
      makeSkill(join(claude, "group"), "inner");
      expect((await rejection(api().deleteSkill(project.id, "group"))).code).toBe("NOT_FOUND");
    });
  });
});
