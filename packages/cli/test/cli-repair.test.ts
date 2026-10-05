import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { HealthFinding, RepairReport } from "@loadout/shared";
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

  it("lists what is in the way and exits 1; doctor and status agree", async () => {
    const link = join(sandbox.agentSkillsDir, "alpha");
    rmSync(link);
    mkdirSync(link);
    writeFileSync(join(link, "SKILL.md"), "# someone else's\n");
    const run = await cli("skills", "repair", "--json");
    expect(run.code).toBe(EXIT_FAILED);
    const report = run.json<RepairReport>();
    expect(report.repaired).toEqual([]);
    expect(report.failed).toEqual([]);
    expect(report.notOurs).toEqual([expect.objectContaining({ skill: "alpha", agentKey: AGENT })]);
    expect((await cli("skills", "repair")).stdout).toContain(`in the way: alpha (${AGENT})`);

    const doctor = (await cli("doctor", "--json")).json<{ findings: HealthFinding[] }>();
    const found = doctor.findings.filter((finding) => finding.area === "deployments");
    expect(found).toEqual([
      expect.objectContaining({ severity: "warning", skill: "alpha", agent: AGENT }),
    ]);
    const status = (await cli("skills", "status", "alpha", "--json")).json<{
      agents: { agent: string; presentOnDisk: boolean; problem: string | null }[];
    }>();
    expect(status.agents.find((a) => a.agent === AGENT)).toMatchObject({
      presentOnDisk: false,
      problem: "not_ours",
    });
  });
});

describe("skills status on disk", () => {
  type Status = { agents: { agent: string; presentOnDisk: boolean; problem: string | null }[] };
  const mine = async () =>
    (await cli("skills", "status", "alpha", "--json"))
      .json<Status>()
      .agents.find((a) => a.agent === AGENT);

  it("reports a link whose target is gone as broken, not present", async () => {
    const link = join(sandbox.agentSkillsDir, "alpha");
    const gone = join(sandbox.root, "gone");
    mkdirSync(gone);
    rmSync(link);
    symlinkSync(gone, link, "dir");
    rmSync(gone, { recursive: true });
    expect(await mine()).toMatchObject({ presentOnDisk: false, problem: "broken" });
    expect((await cli("skills", "status", "alpha")).stdout).toContain("broken");
  });

  it("reports a deleted deployment as missing", async () => {
    rmSync(join(sandbox.agentSkillsDir, "alpha"));
    expect(await mine()).toMatchObject({ presentOnDisk: false, problem: "missing" });
    expect((await cli("skills", "status", "alpha")).stdout).toContain("missing");
  });

  it("reports a healthy deployment as present", async () => {
    expect(await mine()).toMatchObject({ presentOnDisk: true, problem: null });
  });
});
