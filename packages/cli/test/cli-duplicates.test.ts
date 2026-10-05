import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DuplicateMergeResult, DuplicatesReport, HealthReport } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_FAILED, EXIT_OK, EXIT_USAGE } from "../src/run";
import { AGENT, type Run, type Sandbox, createSandbox, writeSkill } from "./harness";

let sandbox: Sandbox;
const cli = (...argv: string[]): Promise<Run> => sandbox.cli(...argv);

const BODY = "# Tools\n\nRead the file.\nMerge the pages.\nSave the result.\nNever overwrite.\n";

beforeEach(async () => {
  sandbox = createSandbox();
  const source = join(sandbox.root, "src");
  writeSkill(source, "pdf-tools", BODY);
  writeSkill(source, "pdf-helper", BODY);
  writeSkill(source, "docker", "# Docker\n\nBuild an image.\n");
  for (const name of ["pdf-tools", "pdf-helper", "docker"]) {
    await cli("skills", "install", `./src/${name}`);
  }
});

afterEach(() => sandbox.cleanup());

describe("skills duplicates", () => {
  it("lists the pair and leaves the unrelated skill out", async () => {
    const run = await cli("skills", "duplicates");
    expect(run.code).toBe(EXIT_OK);
    expect(run.stdout).toContain("pdf-helper");
    expect(run.stdout).toContain("pdf-tools");
    expect(run.stdout).not.toContain("docker");
    expect(run.stdout).toContain("merge --keep");

    const report = (await cli("skills", "duplicates", "--json")).json<DuplicatesReport>();
    expect(report.pairs).toHaveLength(1);
  });

  it("hides a dismissed pair, lists it with --all and brings it back on restore", async () => {
    const dismissed = await cli("skills", "dismiss", "pdf-tools", "pdf-helper");
    expect(dismissed.code).toBe(EXIT_OK);
    expect((await cli("skills", "duplicates")).stdout).toContain("No skills look like duplicates");
    expect((await cli("skills", "duplicates", "--all")).stdout).toContain("pdf-helper");

    await cli("skills", "dismiss", "pdf-helper", "pdf-tools", "--undo");
    expect(
      (await cli("skills", "duplicates", "--json")).json<DuplicatesReport>().pairs,
    ).toHaveLength(1);
  });

  it("appears in the doctor report as something good to know", async () => {
    const report = (await cli("doctor", "--all", "--json")).json<HealthReport>();
    const found = report.findings.filter((finding) => finding.area === "duplicates");
    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe("info");
    expect((await cli("doctor")).code).toBe(EXIT_OK);
  });

  it("previews a merge, needs --yes, then keeps one and carries its agents over", async () => {
    await cli("skills", "deploy", "pdf-helper", "--agent", AGENT);
    await cli("skills", "tag", "pdf-helper", "--add", "office");

    const noYes = await cli("skills", "merge", "--keep", "pdf-tools", "--remove", "pdf-helper");
    expect(noYes.code).toBe(EXIT_USAGE);
    expect(existsSync(join(sandbox.libraryDir, "pdf-helper"))).toBe(true);

    const preview = await cli(
      "skills",
      "merge",
      "--keep",
      "pdf-tools",
      "--remove",
      "pdf-helper",
      "--dry-run",
      "--json",
    );
    expect(preview.json<DuplicateMergeResult>()).toMatchObject({
      tagsAdded: 1,
      deployedTo: [AGENT],
    });
    expect(existsSync(join(sandbox.libraryDir, "pdf-helper"))).toBe(true);

    const done = await cli(
      "skills",
      "merge",
      "--keep",
      "pdf-tools",
      "--remove",
      "pdf-helper",
      "--yes",
    );
    expect(done.code).toBe(EXIT_OK);
    expect(done.stdout).toContain("Recently removed");
    expect(existsSync(join(sandbox.libraryDir, "pdf-helper"))).toBe(false);
    expect(existsSync(join(sandbox.agentSkillsDir, "pdf-tools"))).toBe(true);
    expect(existsSync(join(sandbox.agentSkillsDir, "pdf-helper"))).toBe(false);
  });

  it("keeps the older skills duplicates merge|dismiss|restore forms working", async () => {
    const dismissed = await cli("skills", "duplicates", "dismiss", "pdf-tools", "pdf-helper");
    expect(dismissed.code).toBe(EXIT_OK);
    expect((await cli("skills", "duplicates")).stdout).toContain("No skills look like duplicates");
    expect((await cli("skills", "duplicates", "restore", "pdf-helper", "pdf-tools")).code).toBe(
      EXIT_OK,
    );
    expect(
      (await cli("skills", "duplicates", "--json")).json<DuplicatesReport>().pairs,
    ).toHaveLength(1);
    const merged = await cli(
      "skills",
      "duplicates",
      "merge",
      "--keep",
      "pdf-tools",
      "--remove",
      "pdf-helper",
      "--dry-run",
      "--json",
    );
    expect(merged.code).toBe(EXIT_OK);
    expect(merged.json<DuplicateMergeResult>()).toMatchObject({ keptId: expect.any(String) });
    // The old forms are plumbing: help lists the commands they forward to.
    const help = await cli("skills", "duplicates", "--help");
    expect(help.stdout).not.toContain("--keep");
    expect((await cli("skills", "merge", "--help")).stdout).toContain("--keep");
  });

  it("needs both skills and an action it knows", async () => {
    expect((await cli("skills", "merge", "--keep", "pdf-tools", "--yes")).code).toBe(EXIT_USAGE);
    expect((await cli("skills", "merge", "extra", "--keep", "a", "--remove", "b")).code).toBe(
      EXIT_USAGE,
    );
    expect((await cli("skills", "duplicates", "fix")).code).toBe(EXIT_USAGE);
    expect((await cli("skills", "dismiss", "pdf-tools")).code).toBe(EXIT_USAGE);
    expect((await cli("skills", "duplicates", "dismiss", "pdf-tools")).code).toBe(EXIT_USAGE);
    expect((await cli("skills", "dismiss", "pdf-tools", "nope")).code).toBe(EXIT_FAILED);
  });
});
