import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { HealthReport, UsageReport } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_OK, EXIT_USAGE } from "../src/run";
import { type Run, type Sandbox, createSandbox, writeSkill } from "./harness";

let sandbox: Sandbox;
const cli = (...argv: string[]): Promise<Run> => sandbox.cli(...argv);

beforeEach(() => {
  sandbox = createSandbox();
});

afterEach(() => sandbox.cleanup());

/** A Claude Code session log in which `skill` ran once, now. */
function claudeRan(skill: string): void {
  const dir = join(sandbox.home, ".claude", "projects", "-work");
  mkdirSync(dir, { recursive: true });
  const record = {
    type: "assistant",
    uuid: "u1",
    timestamp: new Date().toISOString(),
    cwd: "/work",
    message: { content: [{ type: "tool_use", id: "t1", name: "Skill", input: { skill } }] },
  };
  writeFileSync(join(dir, "s1.jsonl"), `${JSON.stringify(record)}\n`);
}

describe("skills usage", () => {
  it("says how to turn tracking on while it is off", async () => {
    const run = await cli("skills", "usage");
    expect(run.code).toBe(EXIT_OK);
    expect(run.stdout).toContain("Usage tracking is off.");
    expect(run.stdout).toContain("skills usage --enable");
  });

  it("counts runs once turned on, and forgets them when turned off", async () => {
    writeSkill(join(sandbox.root, "src"), "alpha");
    writeSkill(join(sandbox.root, "src"), "beta");
    await cli("skills", "install", "./src/alpha");
    await cli("skills", "install", "./src/beta");
    claudeRan("alpha");

    const on = await cli("skills", "usage", "--enable");
    expect(on.code).toBe(EXIT_OK);
    expect(on.stdout).toMatch(/alpha\s+1\s+1\s+.+claude_code/);
    expect(on.stdout).toMatch(/beta\s+0\s+0\s+never/);
    expect(on.stdout).not.toContain("--refresh");

    const report = (await cli("skills", "usage", "--json")).json<UsageReport>();
    expect(report.enabled).toBe(true);
    expect(report.skills).toHaveLength(1);
    expect(report.skills[0]).toMatchObject({ uses: 1, projects: ["/work"] });

    const off = (await cli("skills", "usage", "--disable", "--json")).json<UsageReport>();
    expect(off).toMatchObject({ enabled: false, skills: [] });
  });

  it("refuses both switches at once", async () => {
    expect((await cli("skills", "usage", "--enable", "--disable")).code).toBe(EXIT_USAGE);
  });

  it("leaves skills added lately out of the unused ones, in doctor too", async () => {
    writeSkill(join(sandbox.root, "src"), "fresh");
    await cli("skills", "install", "./src/fresh");
    await cli("skills", "usage", "--enable");
    expect((await cli("skills", "usage", "--unused")).stdout).toContain("Every skill ran lately.");
    const doctor = (await cli("doctor", "--json")).json<HealthReport>();
    expect(doctor.findings.filter((finding) => finding.area === "usage")).toEqual([]);
  });
});
