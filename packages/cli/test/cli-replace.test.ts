import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { InstallPlan } from "../src/commands/skills-install-plan";
import { type Sandbox, createSandbox, writeSkill } from "./harness";

let box: Sandbox;
let maker: Sandbox;
let zip: string;

beforeEach(async () => {
  box = createSandbox();
  maker = createSandbox();
  for (const name of ["alpha", "beta"]) {
    await maker.cli("skills", "install", writeSkill(maker.root, name));
  }
  zip = join(maker.root, "pack.zip");
  await maker.cli("skills", "export", "--all", "--out", zip);
  // The box's own alpha, with other content than the archive's.
  await box.cli("skills", "install", writeSkill(join(box.root, "own"), "alpha", "Mine"));
});

afterEach(() => {
  box.cleanup();
  maker.cleanup();
});

const names = async (): Promise<string[]> =>
  (await box.cli("skills", "list", "--json")).json<{ name: string }[]>().map((s) => s.name);

describe("skills install --replace", () => {
  it("plans and puts the archive's skill in place of the library one", async () => {
    const plan = await box.cli(
      "skills",
      "install",
      zip,
      "--all",
      "--replace",
      "--dry-run",
      "--json",
    );
    expect(plan.json<InstallPlan>().skills.map((s) => [s.name, s.outcome.kind])).toEqual([
      ["alpha", "replaces"],
      ["beta", "new"],
    ]);

    const run = await box.cli("skills", "install", zip, "--all", "--replace");
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("Replaced in place: alpha");
    expect(await names()).toEqual(["alpha", "beta"]);
    const removed = await box.cli("removed", "list", "--json");
    expect(removed.json<{ name: string; reason: string }[]>()).toMatchObject([
      { name: "alpha", reason: "replaced" },
    ]);
  });

  it("adds a numbered copy without --replace, and refuses it for a folder", async () => {
    await box.cli("skills", "install", zip, "--all");
    expect(await names()).toEqual(["alpha", "alpha-2", "beta"]);

    const folder = await box.cli("skills", "install", writeSkill(box.root, "beta"), "--replace");
    expect(folder.code).toBe(2);
    expect(folder.stderr).toContain("--replace works for repositories");
  });
});
