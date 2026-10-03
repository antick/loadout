import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { planSkill } from "../src/backup/merge-plan";
import { blockedFindings } from "../src/health/blocked";
import { readBlockedAgents } from "../src/skills/portable";
import { type DeployWorld, createDeployWorld } from "./deploy-world";
import { skillRecord } from "./skill-records";
import { rejection } from "./helpers";

let world: DeployWorld;
const claudeTarget = (dirName: string): string => join(world.home, ".claude", "skills", dirName);
const clineTarget = (dirName: string): string => join(world.home, ".agents", "skills", dirName);

beforeEach(() => {
  world = createDeployWorld();
  world.installAgents(".claude", ".cline");
});
afterEach(() => world.cleanup());

describe("blocking a skill for an agent", () => {
  it("removes what Loadout deployed there and keeps the other agents", async () => {
    const skill = world.addSkill("alpha");
    await world.deploy.api.apply([skill.id], ["claude_code", "cline"], "add");

    const saved = await world.deploy.api.setBlocked(skill.id, ["claude_code"], true);

    expect(saved.blockedAgents).toEqual(["claude_code"]);
    expect(world.store.deployment(skill.id, "claude_code")).toBeNull();
    expect(existsSync(claudeTarget("alpha"))).toBe(false);
    expect(world.store.deployment(skill.id, "cline")).not.toBeNull();
    expect(existsSync(join(skill.libraryPath, "SKILL.md"))).toBe(true);
  });

  it("keeps the skill's last change time, like a tag", async () => {
    const skill = world.addSkill("alpha");
    const saved = await world.deploy.api.setBlocked(skill.id, ["cline"], true);
    expect(saved.updatedAt).toBe(skill.updatedAt);
  });

  it("refuses a direct deploy to a blocked agent and writes nothing", async () => {
    const skill = world.addSkill("alpha");
    await world.deploy.api.setBlocked(skill.id, ["claude_code"], true);
    const error = await rejection(world.deploy.api.deploy(skill.id, "claude_code"));
    expect(error.code).toBe("INVALID_INPUT");
    expect(error.message).toContain("blocked");
    expect(existsSync(claudeTarget("alpha"))).toBe(false);
    expect(world.store.deployments()).toEqual([]);
  });

  it("skips blocked pairs in a batch and counts them", async () => {
    const alpha = world.addSkill("alpha");
    const beta = world.addSkill("beta");
    await world.deploy.api.setBlocked(alpha.id, ["claude_code"], true);

    const preview = await world.deploy.api.apply(
      [alpha.id, beta.id],
      ["claude_code", "cline"],
      "add",
      {
        dryRun: true,
      },
    );
    expect(preview).toMatchObject({ added: 3, blocked: 1, conflicts: [] });
    expect(world.store.deployments()).toEqual([]);

    const result = await world.deploy.api.apply(
      [alpha.id, beta.id],
      ["claude_code", "cline"],
      "add",
    );
    expect(result).toMatchObject({ added: 3, blocked: 1, failed: [] });
    expect(existsSync(claudeTarget("alpha"))).toBe(false);
    expect(existsSync(claudeTarget("beta"))).toBe(true);
    expect(existsSync(clineTarget("alpha"))).toBe(true);
  });

  it("does not count a pair that is not deployable anyway as blocked", async () => {
    const skill = world.addSkill("alpha");
    await world.deploy.api.setBlocked(skill.id, ["cursor"], true);
    const result = await world.deploy.api.apply([skill.id], ["cursor"], "add");
    expect(result).toMatchObject({ added: 0, skipped: 1, blocked: 0 });
  });

  it("still removes a blocked pair in a batch removal", async () => {
    const skill = world.addSkill("alpha");
    await world.deploy.api.deploy(skill.id, "claude_code");
    // A block set on another device leaves this computer's deployment in place.
    world.store.update(skill.id, { blockedAgents: ["claude_code"] });
    const result = await world.deploy.api.apply([skill.id], ["claude_code"], "remove");
    expect(result).toMatchObject({ removed: 1, blocked: 0 });
  });

  it("allows an agent again without deploying to it", async () => {
    const skill = world.addSkill("alpha");
    await world.deploy.api.setBlocked(skill.id, ["claude_code", "cline"], true);
    const saved = await world.deploy.api.setBlocked(skill.id, ["claude_code"], false);
    expect(saved.blockedAgents).toEqual(["cline"]);
    expect(world.store.deployments()).toEqual([]);
    await world.deploy.api.deploy(skill.id, "claude_code");
    expect(existsSync(claudeTarget("alpha"))).toBe(true);
  });

  it("does not repeat a key and rejects an unknown agent without changing anything", async () => {
    const skill = world.addSkill("alpha");
    await world.deploy.api.setBlocked(skill.id, ["cline", "cline"], true);
    await world.deploy.api.setBlocked(skill.id, ["cline"], true);
    expect(world.store.get(skill.id).blockedAgents).toEqual(["cline"]);

    const error = await rejection(world.deploy.api.setBlocked(skill.id, ["nope"], true));
    expect(error.code).toBe("INVALID_INPUT");
    expect(world.store.get(skill.id).blockedAgents).toEqual(["cline"]);
  });

  it("can block an agent that is not installed", async () => {
    const skill = world.addSkill("alpha");
    const saved = await world.deploy.api.setBlocked(skill.id, ["cursor"], true);
    expect(saved.blockedAgents).toEqual(["cursor"]);
  });

  it("travels with the backup metadata", () => {
    const skill = world.addSkill("alpha");
    world.store.update(skill.id, { blockedAgents: ["cline", "claude_code"] });
    world.portable.write();
    world.store.update(skill.id, { blockedAgents: [] });
    world.portable.rebuild({ authoritative: true });
    expect(world.store.get(skill.id).blockedAgents).toEqual(["claude_code", "cline"]);
  });
});

describe("blocked agents read from another device", () => {
  it("keep agent keys only, once each and in order", () => {
    expect(readBlockedAgents(["cline", 3, "../etc", "codex", "cline", "", null])).toEqual([
      "cline",
      "codex",
    ]);
    expect(readBlockedAgents("codex")).toEqual([]);
  });
});

const side = (blocked: string[], treeHash = "t0") => ({
  path: "alpha",
  treeHash,
  meta: {
    id: "s1",
    path: "alpha",
    tags: [],
    source: { type: "local" as const },
    createdAt: 1,
    ...(blocked.length > 0 ? { blockedAgents: blocked } : {}),
  },
});

describe("blocked agents in a backup merge", () => {
  it("merges like tags: a block added on either side stays, one lifted on either side goes", () => {
    const plan = planSkill("s1", {
      base: side(["codex", "cline"]),
      ours: side(["codex", "cline", "cursor"]),
      theirs: side(["codex"]),
    });
    expect(plan.meta?.blockedAgents).toEqual(["codex", "cursor"]);
    expect(plan.outcome).toBe("updated");
  });

  it("reports nothing to do when both sides agree", () => {
    const plan = planSkill("s1", {
      base: side([]),
      ours: side(["codex"]),
      theirs: side(["codex"]),
    });
    expect(plan.outcome).toBe("unchanged");
  });
});

const deployment = (agentKey: string) => ({
  id: agentKey,
  skillId: "a",
  agentKey,
  targetPath: `/agents/${agentKey}/alpha`,
  mode: "symlink" as const,
  syncedAt: null,
});

describe("doctor: blocked but still deployed", () => {
  it("names the pair, and only that pair", () => {
    const findings = blockedFindings([
      skillRecord("a", {
        name: "alpha",
        blockedAgents: ["codex", "cline"],
        deployments: [deployment("codex"), deployment("claude_code")],
      }),
      skillRecord("b", { blockedAgents: ["codex"] }),
    ]);
    expect(findings).toEqual([
      {
        area: "deployments",
        severity: "warning",
        message: "Blocked for this agent but still deployed. Remove it, or allow it again.",
        skill: "alpha",
        agent: "codex",
        path: "/agents/codex/alpha",
      },
    ]);
  });
});
