import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { HealthReport } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_FAILED, EXIT_OK, EXIT_USAGE } from "../src/run";
import { AGENT, type Run, type Sandbox, createSandbox, writeSkill } from "./harness";

let sandbox: Sandbox;
const cli = (...argv: string[]): Promise<Run> => sandbox.cli(...argv);

beforeEach(() => {
  sandbox = createSandbox();
});

afterEach(() => sandbox.cleanup());

describe("doctor", () => {
  it("says so when everything is healthy", async () => {
    const run = await cli("doctor");
    expect(run.code).toBe(EXIT_OK);
    expect(run.stdout).toContain("Checked 0 skills, 1 agent and 0 projects: 0 errors, 0 warnings");
    expect(run.stdout).toContain("Everything looks healthy.");
  });

  it("reports broken setups by area and fails on errors", async () => {
    writeSkill(join(sandbox.root, "src"), "alpha");
    await cli("skills", "install", "./src/alpha");
    await cli("skills", "deploy", "alpha", "--agent", AGENT);
    rmSync(join(sandbox.agentSkillsDir, "alpha"));
    mkdirSync(join(sandbox.agentSkillsDir, "empty"), { recursive: true });
    writeSkill(sandbox.agentSkillsDir, "by-hand");

    const run = await cli("doctor");
    expect(run.code).toBe(EXIT_FAILED);
    expect(run.stdout).toContain("Deployments:");
    expect(run.stdout).toContain(`error: alpha (${AGENT}): Deployed, but not on disk.`);
    expect(run.stdout).toContain(`warning: empty (${AGENT}): No SKILL.md inside`);
    expect(run.stdout).not.toContain("Not in the library.");
    expect(run.stdout).toContain("Run with --all to list the rest.");
    expect((await cli("doctor", "--all")).stdout).toContain(
      `info: by-hand (${AGENT}): Not in the library.`,
    );

    const report = (await cli("doctor", "--json")).json<HealthReport>();
    expect(report.counts).toEqual({ error: 1, warning: 1, info: 1 });
    expect(report.findings.map((finding) => finding.area)).toEqual([
      "deployments",
      "agent_folders",
      "agent_folders",
    ]);
  });

  it("names every agent that shares a folder in one finding", async () => {
    // Cline and Warp both keep their skills in ~/.agents/skills.
    mkdirSync(join(sandbox.home, ".cline"), { recursive: true });
    mkdirSync(join(sandbox.home, ".warp"), { recursive: true });
    mkdirSync(join(sandbox.home, ".agents", "skills", "empty"), { recursive: true });

    const report = (await cli("doctor", "--json")).json<HealthReport>();
    const shared = report.findings.filter((finding) => finding.skill === "empty");
    expect(shared).toHaveLength(1);
    expect(shared[0]?.agent?.split(", ").sort()).toEqual(["cline", "warp"]);
  });

  it("takes no arguments and has its own help", async () => {
    expect((await cli("doctor", "extra")).code).toBe(EXIT_USAGE);
    const help = await cli("doctor", "--help");
    expect(help.stdout).toContain("Usage: loadout doctor [--all]");
  });
});
