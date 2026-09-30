import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { HealthReport, SkillListingReport } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_OK, EXIT_USAGE } from "../src/run";
import { type Run, type Sandbox, createSandbox } from "./harness";

let sandbox: Sandbox;
const cli = (...argv: string[]): Promise<Run> => sandbox.cli(...argv);

beforeEach(() => {
  sandbox = createSandbox();
});
afterEach(() => sandbox.cleanup());

/** A skill written straight into Claude Code's folder, as a hand-made or plugin skill would be. */
function agentSkill(name: string, description: string, extra = ""): void {
  const dir = join(sandbox.agentSkillsDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n${extra}---\n\n# ${name}\n`,
  );
}

describe("agents listing", () => {
  it("estimates what the skill listing costs", async () => {
    agentSkill("alpha", "Does alpha things.");
    agentSkill("quiet", "Only by hand.", "disable-model-invocation: true\n");
    const run = await cli("agents", "listing");
    expect(run.code).toBe(EXIT_OK);
    expect(run.stdout).toContain("Claude Code skill listing");
    expect(run.stdout).toContain("1 with a description, 0 by name only, 1 hidden");
    expect(run.stdout).toMatch(/alpha\s+\d+/);
    expect(run.stdout).toMatch(/quiet\s+0\s+folder\s+manual only/);
    expect(run.stdout).not.toContain("Over budget");
  });

  it("gives the whole report as JSON", async () => {
    agentSkill("alpha", "Does alpha things.");
    const report = (await cli("agents", "listing", "--json")).json<SkillListingReport>();
    expect(report).toMatchObject({
      agentKey: "claude_code",
      budget: 8000,
      window: "200k",
      over: 0,
    });
    expect(report.entries.map((entry) => entry.name)).toEqual(["alpha"]);
  });

  it("assumes a bigger window on request, and refuses one it does not know", async () => {
    agentSkill("alpha", "Does alpha things.");
    const big = (
      await cli("agents", "listing", "--window", "1m", "--json")
    ).json<SkillListingReport>();
    expect(big).toMatchObject({ budget: 40000, window: "1m" });
    const bad = await cli("agents", "listing", "--window", "2m");
    expect(bad.code).toBe(EXIT_USAGE);
    expect(bad.stderr).toContain("--window must be one of");
  });

  it("warns when over budget, in the listing and in doctor, and shows the biggest first", async () => {
    for (let i = 0; i < 30; i += 1) agentSkill(`skill-${i}`, "d".repeat(300));
    const run = await cli("agents", "listing");
    expect(run.stdout).toContain("Over budget");
    expect(run.stdout).toContain("Run with --all to list them.");
    const all = await cli("agents", "listing", "--all");
    expect(all.stdout).not.toContain("Run with --all");

    const doctor = (await cli("doctor", "--json")).json<HealthReport>();
    const finding = doctor.findings.find((entry) => entry.area === "listing");
    expect(finding).toMatchObject({ severity: "warning", agent: "claude_code" });
    const text = (await cli("doctor")).stdout;
    expect(text).toContain("Skill listing:");
  });

  it("stays out of doctor while the listing fits", async () => {
    agentSkill("alpha", "Does alpha things.");
    const doctor = (await cli("doctor", "--json")).json<HealthReport>();
    expect(doctor.findings.filter((entry) => entry.area === "listing")).toEqual([]);
  });
});
