import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RepairReport } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_FAILED, EXIT_OK } from "../src/run";
import { AGENT, type Run, type Sandbox, createSandbox, writeSkill } from "./harness";

let sandbox: Sandbox;
const cli = (...argv: string[]): Promise<Run> => sandbox.cli(...argv);

beforeEach(async () => {
  sandbox = createSandbox();
  writeSkill(join(sandbox.root, "src"), "alpha");
  await cli("skills", "install", "./src/alpha");
  await cli("skills", "deploy", "alpha", "--agent", AGENT);
});

afterEach(() => sandbox.cleanup());

describe("skills repair", () => {
  it("puts a missing deployment back", async () => {
    const link = join(sandbox.agentSkillsDir, "alpha");
    rmSync(link);
    const run = await cli("skills", "repair");
    expect(run.code).toBe(EXIT_OK);
    expect(run.stdout).toContain("1 put back, 0 could not be");
    expect(run.stdout).toContain(`put back: alpha (${AGENT})`);
    expect(existsSync(join(link, "SKILL.md"))).toBe(true);
    expect((await cli("doctor")).code).toBe(EXIT_OK);
  });

  it("lists what is in the way and exits 1", async () => {
    const link = join(sandbox.agentSkillsDir, "alpha");
    rmSync(link);
    mkdirSync(link);
    writeFileSync(join(link, "SKILL.md"), "# someone else's\n");
    const run = await cli("skills", "repair", "--json");
    expect(run.code).toBe(EXIT_FAILED);
    const report = run.json<RepairReport>();
    expect(report.repaired).toEqual([]);
    expect(report.failed).toHaveLength(1);
    expect(report.failed[0]).toMatchObject({ skill: "alpha", agentKey: AGENT });
  });
});
