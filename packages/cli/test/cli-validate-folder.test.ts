import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LIBRARY_DIR_NAME } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_FAILED, EXIT_OK } from "../src/run";
import { type Run, type Sandbox, createSandbox, writeSkill } from "./harness";

/** `skills validate <folder>`: checks a skills repository without a library, as CI would. */

let sandbox: Sandbox;
const cli = (...argv: string[]): Promise<Run> => sandbox.cli(...argv);
const repo = (): string => join(sandbox.root, "repo");

interface FolderResult {
  skills: { path: string; name: string; issues: { code: string }[] }[];
  duplicates: { name: string; paths: string[] }[];
}

beforeEach(() => {
  sandbox = createSandbox();
});

afterEach(() => sandbox.cleanup());

describe("skills validate <folder>", () => {
  it("passes a clean folder without creating a library", async () => {
    writeSkill(join(repo(), "skills"), "alpha");
    writeSkill(join(repo(), "skills"), "beta");

    const run = await cli("skills", "validate", "./repo", "--json");
    expect(run.code).toBe(EXIT_OK);
    const result = run.json<FolderResult>();
    expect(result.skills.map((skill) => skill.path)).toEqual(["skills/alpha", "skills/beta"]);
    expect(result.duplicates).toEqual([]);
    expect(existsSync(join(sandbox.home, LIBRARY_DIR_NAME))).toBe(false);
  });

  it("fails on format errors and says which folder", async () => {
    const bad = writeSkill(join(repo(), "skills"), "bad");
    writeFileSync(join(bad, "SKILL.md"), "---\nname: bad\n---\nNo description.\n");

    const run = await cli("skills", "validate", "./repo");
    expect(run.code).toBe(EXIT_FAILED);
    expect(run.stdout).toContain("skills/bad:");
    expect(run.stdout).toContain("The frontmatter has no description.");
    expect(run.stdout).toContain("1 with errors");
  });

  it("fails on a name used twice in one place, not on per-agent copies", async () => {
    writeSkill(join(repo(), "skills"), "pdf");
    writeSkill(join(repo(), ".claude", "skills"), "pdf");
    const clash = join(repo(), "more", "pdf-copy");
    mkdirSync(clash, { recursive: true });
    writeFileSync(
      join(clash, "SKILL.md"),
      "---\nname: PDF\ndescription: A second skill that uses the same name.\n---\n",
    );

    const run = await cli("skills", "validate", "./repo", "--json");
    expect(run.code).toBe(EXIT_FAILED);
    expect(run.json<FolderResult>().duplicates).toEqual([
      { name: "PDF", paths: ["more/pdf-copy", "skills/pdf"] },
    ]);
  });

  it("checks one skill folder given directly", async () => {
    writeSkill(repo(), "solo");
    const run = await cli("skills", "validate", "./repo/solo", "--json");
    expect(run.code).toBe(EXIT_OK);
    expect(run.json<FolderResult>().skills).toMatchObject([{ path: "solo", name: "solo" }]);
  });

  it("fails on a folder without skills, or one that is not there", async () => {
    mkdirSync(repo(), { recursive: true });
    const empty = await cli("skills", "validate", "./repo");
    expect(empty.code).toBe(EXIT_FAILED);
    expect(empty.stderr).toContain("No skills in");
    expect((await cli("skills", "validate", "./missing")).code).toBe(EXIT_FAILED);
  });

  it("asks for a folder when a skill name is given and there is no library", async () => {
    const run = await cli("skills", "validate", "alpha");
    expect(run.code).toBe(EXIT_FAILED);
    expect(run.stderr).toContain("give a folder");
  });
});
