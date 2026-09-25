import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeSkill } from "./helpers";
import { type WorkspaceWorld, createWorkspaceWorld } from "./workspace-world";

let world: WorkspaceWorld;

beforeEach(() => {
  world = createWorkspaceWorld();
});
afterEach(() => world.cleanup());

describe("skills an agent loads twice", () => {
  it("marks a skill of Codex's own folder that ~/.agents/skills holds too, but not a link to it", async () => {
    world.installAgents(".codex");
    const shared = join(world.home, ".agents", "skills");
    const own = join(world.home, ".codex", "skills");
    const sharedCopy = makeSkill(shared, "commit");
    makeSkill(shared, "linked");
    makeSkill(own, "commit");
    makeSkill(own, "solo");
    mkdirSync(own, { recursive: true });
    symlinkSync(join(shared, "linked"), join(own, "linked"), "dir");

    const skills = await world.workspace.api.list("codex");
    const byName = Object.fromEntries(skills.map((skill) => [skill.dirName, skill.duplicates]));
    expect(byName.commit).toEqual([
      { where: "shared_folder", agentKey: "codex", agentDisplayName: "Codex", path: sharedCopy },
    ]);
    expect(byName.solo).toEqual([]);
    expect(byName.linked).toEqual([]);
  });

  it("marks a switched-on project skill the same agent also has globally", async () => {
    world.installAgents(".claude");
    const globalCopy = makeSkill(join(world.home, ".claude", "skills"), "review");
    const repo = join(world.root, "work", "repo");
    mkdirSync(repo, { recursive: true });
    const project = await world.projects.api.add(repo);
    makeSkill(join(repo, ".claude", "skills"), "review");
    makeSkill(join(repo, ".claude", "skills"), "local-only");
    makeSkill(join(repo, ".claude", "skills-disabled"), "parked");
    makeSkill(join(world.home, ".claude", "skills"), "parked");

    const skills = await world.projects.api.skills(project.id);
    const byName = Object.fromEntries(skills.map((skill) => [skill.dirName, skill.duplicates]));
    expect(byName.review).toEqual([
      {
        where: "global",
        agentKey: "claude_code",
        agentDisplayName: "Claude Code",
        path: globalCopy,
      },
    ]);
    expect(byName["local-only"]).toEqual([]);
    // A switched-off copy is not loaded, so it is not loaded twice.
    expect(byName.parked).toEqual([]);
  });
});
