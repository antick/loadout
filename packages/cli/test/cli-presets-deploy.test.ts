import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_FAILED, EXIT_OK } from "../src/run";
import { AGENT, type Run, type Sandbox, createSandbox, writeSkill } from "./harness";

let sandbox: Sandbox;
const cli = (...argv: string[]): Promise<Run> => sandbox.cli(...argv);
const deployed = (name: string): boolean => existsSync(join(sandbox.agentSkillsDir, name));

beforeEach(async () => {
  sandbox = createSandbox();
  for (const name of ["alpha", "beta"]) {
    writeSkill(join(sandbox.root, "src"), name);
    await cli("skills", "install", `./src/${name}`);
  }
  await cli("presets", "create", "Writing");
  await cli("presets", "add", "Writing", "alpha", "beta");
});

afterEach(() => sandbox.cleanup());

describe("presets deploy", () => {
  it("previews with --dry-run and writes nothing", async () => {
    const dry = await cli("presets", "deploy", "Writing", "--dry-run", "--json");
    expect(dry.code).toBe(EXIT_OK);
    expect(dry.json()).toMatchObject({ dryRun: true, added: 2 });
    expect((await cli("presets", "deploy", "Writing", "--dry-run")).stdout).toContain(
      "Nothing was changed.",
    );
    expect(deployed("alpha")).toBe(false);
    expect((await cli("presets", "deploy", "Writing", "--json")).json()).toMatchObject({
      dryRun: false,
      added: 2,
    });
  });

  // One rule with `skills deploy`: a folder it may not replace refuses the whole request, with
  // or without --agent, and the dry run refuses exactly the same.
  for (const agentArgs of [[], ["--agent", AGENT]]) {
    const label = agentArgs.length > 0 ? "with --agent" : "for every enabled agent";
    it(`refuses a foreign folder ${label}, unless told to skip it`, async () => {
      const theirs = writeSkill(sandbox.agentSkillsDir, "beta", "# made by hand\n");
      const run = (...extra: string[]) =>
        cli("presets", "deploy", "Writing", ...agentArgs, ...extra, "--json");

      for (const refused of [await run(), await run("--dry-run")]) {
        expect(refused.code).toBe(EXIT_FAILED);
        expect(refused.json()).toMatchObject({ ok: false, code: "TARGET_CONFLICT" });
      }
      expect(deployed("alpha")).toBe(false);

      const preview = await run("--dry-run", "--skip-conflicts");
      expect(preview.json()).toMatchObject({ dryRun: true, added: 1, conflicts: [{}] });
      expect(deployed("alpha")).toBe(false);

      const skipped = await cli("presets", "deploy", "Writing", ...agentArgs, "--skip-conflicts");
      expect(skipped.code).toBe(EXIT_OK);
      expect(skipped.stdout).toContain("1 deployment added");
      expect(skipped.stdout).toContain(`Left alone: ${theirs}`);
      expect(deployed("alpha")).toBe(true);
      expect(readFileSync(join(theirs, "SKILL.md"), "utf8")).toContain("made by hand");
    });
  }
});
