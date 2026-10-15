import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DeployWorld, createDeployWorld } from "./deploy-world";
import { writeFile } from "./helpers";

const HEAD = "ref: refs/heads/main\n";

/**
 * A `.git` folder in a copy: its hash cannot see it, and no copy Loadout makes holds one, so it
 * is the user's own and must never be deleted with the copy.
 */
describe("a copy holding a .git folder of the user's", () => {
  let world: DeployWorld;
  const target = (dirName: string): string => join(world.home, ".claude", "skills", dirName);
  const gitHead = (dirName: string): string => join(target(dirName), ".git", "HEAD");

  beforeEach(() => {
    world = createDeployWorld();
    world.installAgents(".claude");
    world.ctx.settings.set("deployMode", "copy");
  });
  afterEach(() => world.cleanup());

  it("is set aside in Recently removed by an undeploy, not deleted", async () => {
    const skill = world.addSkill("alpha");
    await world.deploy.api.deploy(skill.id, "claude_code");
    writeFile(gitHead("alpha"), HEAD);

    const asked = await world.deploy.api.undeploy(skill.id, "claude_code", { dryRun: true });
    expect(asked.editedCopies).toEqual([target("alpha")]);

    const done = await world.deploy.api.undeploy(skill.id, "claude_code");
    expect(done.removedIds).toHaveLength(1);
    expect(existsSync(target("alpha"))).toBe(false);
    await world.removed.restore(done.removedIds[0] ?? "");
    expect(readFileSync(gitHead("alpha"), "utf8")).toBe(HEAD);
  });

  it("is set aside when a library change rewrites the copy", async () => {
    const skill = world.addSkill("alpha");
    await world.deploy.api.deploy(skill.id, "claude_code");
    writeFile(gitHead("alpha"), HEAD);
    writeFile(join(skill.libraryPath, "extra.md"), "new\n");
    const changed = world.rehash(skill);

    const report = await world.deploy.refreshCopies(changed);
    expect(report.failed).toEqual([]);
    expect(existsSync(join(target("alpha"), "extra.md"))).toBe(true);
    expect(existsSync(gitHead("alpha"))).toBe(false);
    const [kept] = world.removed.list();
    expect(kept).toBeDefined();
    await world.removed.restore(kept?.id ?? "");
    expect(readFileSync(gitHead("alpha"), "utf8")).toBe(HEAD);
  });

  it("is kept in place by a refresh that keeps edited copies", async () => {
    const skill = world.addSkill("alpha");
    await world.deploy.api.deploy(skill.id, "claude_code");
    writeFile(join(target("alpha"), "nested", ".git", "HEAD"), HEAD);
    writeFile(join(skill.libraryPath, "extra.md"), "new\n");
    world.rehash(skill);

    const report = await world.deploy.refreshStaleCopies();
    expect(report.kept).toEqual([{ skill: "alpha", agent: "Claude Code" }]);
    expect(readFileSync(join(target("alpha"), "nested", ".git", "HEAD"), "utf8")).toBe(HEAD);
  });

  it("still deletes a copy left as it was made", async () => {
    const skill = world.addSkill("alpha");
    await world.deploy.api.deploy(skill.id, "claude_code");
    const done = await world.deploy.api.undeploy(skill.id, "claude_code");
    expect(done).toEqual({ editedCopies: [], removedIds: [] });
    expect(existsSync(target("alpha"))).toBe(false);
    expect(world.removed.list()).toEqual([]);
  });
});
