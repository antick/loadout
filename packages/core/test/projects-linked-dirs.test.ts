import { lstatSync, mkdirSync, readdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type WorkspaceWorld, createWorkspaceWorld } from "./workspace-world";

/**
 * Two agents' project skills folders that are one folder through a link (`.cursor/skills` →
 * `../.claude/skills`): one target, written to once, listed once.
 */
describe("project skills folders joined by a link", () => {
  let world: WorkspaceWorld;
  let repo: string;
  let claude: string;
  const api = () => world.projects.api;

  beforeEach(() => {
    world = createWorkspaceWorld();
    world.installAgents(".claude", ".cursor");
    repo = join(world.root, "work", "repo");
    claude = join(repo, ".claude", "skills");
    mkdirSync(claude, { recursive: true });
    mkdirSync(join(repo, ".cursor"), { recursive: true });
    symlinkSync("../.claude/skills", join(repo, ".cursor", "skills"), "dir");
  });
  afterEach(() => world.cleanup());

  it("merges both agents into one target on the folder no link leads into", async () => {
    const project = await api().add(repo);
    const targets = await api().targets(project.id);
    const joined = targets.filter((t) => t.agentKeys.includes("claude_code"));
    expect(joined).toHaveLength(1);
    expect(joined[0]?.agentKeys).toEqual(expect.arrayContaining(["claude_code", "cursor"]));
    expect(joined[0]?.relativeDir).toBe(".claude/skills");
    expect(targets.some((t) => t.relativeDir === ".cursor/skills")).toBe(false);
  });

  it("creates a skill once for both agents", async () => {
    const project = await api().add(repo);
    const created = await api().createSkill(
      project.id,
      { name: "notes", description: "Keep notes." },
      ["claude_code", "cursor"],
    );
    expect(created.relativePath).toBe("notes");
    expect(readdirSync(claude)).toEqual(["notes"]);
    expect((await api().skills(project.id)).map((skill) => skill.dirName)).toEqual(["notes"]);
  });

  it.each(["copy", "symlink"] as const)("exports a skill once in %s mode", async (mode) => {
    const skill = world.addSkill("alpha");
    world.ctx.settings.set("deployMode", mode);
    const project = await api().add(repo);
    await api().exportSkill(skill.id, project.id, ["claude_code", "cursor"]);
    expect(readdirSync(claude)).toEqual(["alpha"]);
    expect(lstatSync(join(claude, "alpha")).isSymbolicLink()).toBe(mode === "symlink");
    expect((await api().skills(project.id)).map((listed) => listed.dirName)).toEqual(["alpha"]);
  });
});
