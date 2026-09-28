import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { InstallPlan } from "../src/commands/skills-install-plan";
import type { UpdatePlan } from "../src/commands/skills-update-plan";
import { type Sandbox, createSandbox, writeSkill } from "./harness";

let box: Sandbox;
beforeEach(() => {
  box = createSandbox();
});
afterEach(() => box.cleanup());

const names = async (): Promise<string[]> =>
  (await box.cli("skills", "list", "--json")).json<{ name: string }[]>().map((s) => s.name);

describe("skills install --dry-run", () => {
  it("says what a folder would become and installs nothing", async () => {
    const folder = writeSkill(box.root, "pdf");
    const fresh = await box.cli("skills", "install", folder, "--dry-run", "--json");
    expect(fresh.code).toBe(0);
    expect(fresh.json<InstallPlan>()).toMatchObject({
      dryRun: true,
      skills: [{ name: "pdf", outcome: { kind: "new", installAs: "pdf" } }],
    });
    expect(await names()).toEqual([]);

    // Another skill called pdf: this one would be numbered.
    await box.cli("skills", "install", writeSkill(join(box.root, "other"), "pdf"));
    const taken = await box.cli("skills", "install", folder, "--dry-run");
    expect(taken.stdout).toContain("name in use → pdf-2");
    expect(taken.stdout).toContain("Dry run: nothing was installed.");
    expect(await names()).toEqual(["pdf"]);
  });

  it("lists every skill of a multi-skill archive and leaves nothing behind", async () => {
    const maker = createSandbox();
    for (const name of ["alpha", "beta"]) {
      await maker.cli("skills", "install", writeSkill(maker.root, name));
    }
    const zip = join(maker.root, "pack.zip");
    await maker.cli("skills", "export", "--all", "--out", zip);
    try {
      const plan = await box.cli("skills", "install", zip, "--all", "--dry-run", "--json");
      expect(plan.json<InstallPlan>().skills.map((s) => [s.name, s.outcome.kind])).toEqual([
        ["alpha", "new"],
        ["beta", "new"],
      ]);
      expect(await names()).toEqual([]);
      // Still a usage error without --all or --skill, dry run or not.
      expect((await box.cli("skills", "install", zip, "--dry-run")).code).toBe(2);
    } finally {
      maker.cleanup();
    }
  });
});

describe("skills update --dry-run", () => {
  it("lists what would change and what would be held back, changing nothing", async () => {
    const folder = writeSkill(box.root, "notes");
    writeFileSync(join(folder, "old.md"), "old\n");
    await box.cli("skills", "install", folder);
    const up = await box.cli("skills", "update", "notes", "--dry-run", "--json");
    expect(up.json<UpdatePlan>().skills[0]).toMatchObject({ added: [], removed: [], modified: [] });

    writeFileSync(join(folder, "new.md"), "new\n");
    rmSync(join(folder, "old.md"));
    const run = await box.cli("skills", "update", "notes", "--dry-run");
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("+ new.md");
    expect(run.stdout).toContain("- old.md");
    expect(run.stdout).toContain("Held back without --approve-removals");
    // `--all` looks at what a check finds, like the real run: fresh from install, nothing yet.
    const fresh = await box.cli("skills", "update", "--all", "--dry-run", "--json");
    expect(fresh.json<UpdatePlan>().skills).toEqual([]);
    await box.cli("skills", "check", "--all", "--force");
    const json = (
      await box.cli("skills", "update", "--all", "--dry-run", "--json")
    ).json<UpdatePlan>();
    expect(json.skills).toHaveLength(1);
    expect(json.skills[0]).toMatchObject({
      added: ["new.md"],
      removed: ["old.md"],
      heldBack: ["old.md"],
    });
    // Nothing changed: the library copy still differs from its source by the same files.
    expect((await box.cli("skills", "diff", "notes", "--upstream")).stdout).toContain("old.md");
  });

  it("fails the run when a source cannot be read", async () => {
    const folder = writeSkill(box.root, "gone");
    await box.cli("skills", "install", folder);
    rmSync(folder, { recursive: true });
    const run = await box.cli("skills", "update", "gone", "--dry-run");
    expect(run.code).toBe(1);
    expect(run.stdout).toContain("gone: could not read its source");
  });
});
