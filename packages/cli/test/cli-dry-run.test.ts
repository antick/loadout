import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Skill } from "@loadout/shared";
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
    // `--all` looks upstream now, like the real run, even right after the install.
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

  it("holds back what the real update holds back: a file edited by hand in the library", async () => {
    const folder = writeSkill(box.root, "notes");
    writeFileSync(join(folder, "guide.md"), "v1\n");
    await box.cli("skills", "install", folder);
    const shown = (await box.cli("skills", "show", "notes", "--json")).json<{
      libraryPath: string;
    }>();
    // Changed outside the app, so the skill's own record of edits does not know about it.
    writeFileSync(join(shown.libraryPath, "guide.md"), "my own words\n");
    writeFileSync(join(folder, "guide.md"), "v2\n");

    const plan = (
      await box.cli("skills", "update", "notes", "--dry-run", "--json")
    ).json<UpdatePlan>();
    expect(plan.skills[0]?.heldBack).toEqual(["guide.md"]);

    const real = await box.cli("skills", "update", "notes", "--json");
    expect(real.json<{ pendingRemovals: { path: string }[] }>().pendingRemovals).toEqual([
      expect.objectContaining({ path: "guide.md" }),
    ]);
  });

  it("fails the run when a source cannot be read", async () => {
    const folder = writeSkill(box.root, "gone");
    await box.cli("skills", "install", folder);
    rmSync(folder, { recursive: true });
    const run = await box.cli("skills", "update", "gone", "--dry-run");
    expect(run.code).toBe(1);
    expect(run.stdout).toContain("gone: could not read its source");
    // A dry run writes nothing, not even that the source is missing.
    const shown = await box.cli("skills", "show", "gone", "--json");
    expect(shown.json<{ updateStatus: string }>().updateStatus).toBe("local_only");
  });

  it("reads each source once", async () => {
    let downloads = 0;
    const archive = zipSync({ "SKILL.md": strToU8("---\nname: notes\ndescription: Notes\n---\n") });
    const fetched = createSandbox({
      fetchImpl: (async () => {
        downloads += 1;
        return new Response(Buffer.from(archive), {
          headers: { "content-type": "application/zip" },
        });
      }) as typeof fetch,
    });
    try {
      expect((await fetched.cli("skills", "install", "https://example.com/notes.zip")).code).toBe(
        0,
      );
      downloads = 0;
      const plan = await fetched.cli("skills", "update", "notes", "--dry-run", "--json");
      expect(plan.json<UpdatePlan>().skills[0]).toMatchObject({ name: "notes", error: null });
      expect(downloads).toBe(1);
    } finally {
      fetched.cleanup();
    }
  });
});

describe("a dry run checks its input like the real run", () => {
  it("refuses install flags a source cannot use, before fetching anything", async () => {
    const folder = writeSkill(box.root, "pdf");
    const cases = [
      ["acme/skills@pdf", "--skill", "pdf"],
      ["acme/skills@pdf", "--all"],
      ["acme/skills@pdf", "--replace"],
      ["@acme/pdf", "--name", "mine"],
      ["@acme/pdf", "--replace"],
      [folder, "--all"],
      [folder, "--skill", "pdf"],
      [folder, "--replace"],
    ];
    for (const argv of cases) {
      for (const dry of [["--dry-run"], []]) {
        const run = await box.cli("skills", "install", ...argv, ...dry);
        expect(run.code, [...argv, ...dry].join(" ")).toBe(2);
      }
    }
    expect(await names()).toEqual([]);
  });

  it("refuses a folder without SKILL.md in both runs", async () => {
    const empty = join(box.root, "not-a-skill");
    mkdirSync(empty);
    writeFileSync(join(empty, "README.md"), "no skill here\n");
    for (const dry of [["--dry-run"], []]) {
      const run = await box.cli("skills", "install", empty, ...dry, "--json");
      expect(run.code, dry.join(" ")).toBe(1);
      expect(run.json()).toMatchObject({ code: "INVALID_INPUT" });
    }
    expect(await names()).toEqual([]);
  });

  it("checks --skill against a one-skill archive in both runs", async () => {
    const maker = createSandbox();
    await maker.cli("skills", "install", writeSkill(maker.root, "solo"));
    const zip = join(maker.root, "solo.zip");
    await maker.cli("skills", "export", "solo", "--out", zip);
    try {
      for (const dry of [["--dry-run"], []]) {
        const run = await box.cli("skills", "install", zip, "--skill", "ghost", ...dry, "--json");
        expect(run.code, dry.join(" ")).toBe(1);
        expect(run.json()).toMatchObject({ code: "NOT_FOUND" });
      }
      expect(await names()).toEqual([]);
    } finally {
      maker.cleanup();
    }
  });

  it("installs a one-skill archive through the same preview as its dry run", async () => {
    const maker = createSandbox();
    await maker.cli("skills", "install", writeSkill(maker.root, "solo"));
    const zip = join(maker.root, "solo.zip");
    await maker.cli("skills", "export", "solo", "--out", zip);
    try {
      const plan = await box.cli("skills", "install", zip, "--dry-run", "--json");
      const [planned] = plan.json<InstallPlan>().skills;
      const run = await box.cli("skills", "install", zip, "--json");
      expect(run.json<{ installed: Skill[] }>().installed).toMatchObject([
        { name: "solo", sourceSubpath: planned?.relPath },
      ]);
    } finally {
      maker.cleanup();
    }
  });

  it("refuses the same options and missing things as the real run", async () => {
    await box.cli("skills", "install", writeSkill(box.root, "notes"));
    for (const dry of [["--dry-run"], []]) {
      for (const argv of [
        ["skills", "update", "--all", "--accept-risk"],
        ["skills", "duplicates", "--keep", "notes"],
      ]) {
        expect((await box.cli(...argv, ...dry)).code, [...argv, ...dry].join(" ")).toBe(2);
      }
    }
    expect((await box.cli("skills", "duplicates", "dismiss", "notes", "x", "--all")).code).toBe(2);
    expect((await box.cli("project", "suggest", "--agent", "claude_code")).code).toBe(2);
  });

  it("shows the name --name gives an imported preset", async () => {
    await box.cli("presets", "create", "Kit");
    const file = join(box.root, "kit.json");
    await box.cli("presets", "export", "Kit", "--out", file);
    const plan = await box.cli("presets", "import", file, "--name", "Other", "--dry-run", "--json");
    expect(plan.json()).toMatchObject({ plan: { name: "Other", nameTaken: false } });
    const taken = await box.cli("presets", "import", file, "--name", "kit", "--dry-run", "--json");
    expect(taken.json()).toMatchObject({ plan: { name: "kit", nameTaken: true } });
  });
});
