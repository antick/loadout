import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { UpdatePlan } from "../src/commands/skills-update-plan";
import { EXIT_FAILED, EXIT_OK } from "../src/run";
import { type Sandbox, createSandbox, writeSkill } from "./harness";

/** A bulk run whose source checks fail for some skills must say so and fail. */

let box: Sandbox;
const failedNames = (failed: { name: string }[]): string[] => failed.map((entry) => entry.name);

beforeEach(async () => {
  box = createSandbox();
  await box.cli("skills", "install", writeSkill(join(box.root, "src"), "healthy"));
  const broken = writeSkill(join(box.root, "src"), "broken");
  await box.cli("skills", "install", broken);
  // Still there but no longer a folder or archive: the check ends in "error", not "source gone".
  rmSync(broken, { recursive: true });
  writeFileSync(broken, "not a skill folder\n");
  // Fresh from install, both count as checked; a failed check is asked again on every run.
  await box.cli("skills", "check", "--all", "--force");
});

afterEach(() => box.cleanup());

describe("bulk runs with failed source checks", () => {
  it("skills check --all names the failure and fails", async () => {
    const run = await box.cli("skills", "check", "--all", "--force", "--json");
    expect(run.code).toBe(EXIT_FAILED);
    expect(failedNames(run.json<{ failed: { name: string }[] }>().failed)).toEqual(["broken"]);
  });

  it("skills update --all names the failure in text and --json and fails", async () => {
    const json = await box.cli("skills", "update", "--all", "--json");
    expect(json.code).toBe(EXIT_FAILED);
    expect(failedNames(json.json<{ failed: { name: string }[] }>().failed)).toEqual(["broken"]);

    const text = await box.cli("skills", "update", "--all");
    expect(text.code).toBe(EXIT_FAILED);
    expect(text.stdout).toContain("Failed: broken - ");
  });

  it("skills update --all --dry-run names the failure in text and --json and fails", async () => {
    const json = await box.cli("skills", "update", "--all", "--dry-run", "--json");
    expect(json.code).toBe(EXIT_FAILED);
    const plan = json.json<UpdatePlan>();
    expect(plan.skills).toEqual([]);
    expect(failedNames(plan.failed)).toEqual(["broken"]);

    const text = await box.cli("skills", "update", "--all", "--dry-run");
    expect(text.code).toBe(EXIT_FAILED);
    expect(text.stdout).toContain("Failed: broken - ");
  });

  it("passes once the source is readable again", async () => {
    const broken = join(box.root, "src", "broken");
    rmSync(broken);
    writeSkill(join(box.root, "src"), "broken");
    const run = await box.cli("skills", "update", "--all", "--json");
    expect(run.code).toBe(EXIT_OK);
    expect(run.json<{ failed: unknown[] }>().failed).toEqual([]);
  });
});
