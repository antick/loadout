import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_OK } from "../src/run";
import { type Run, type Sandbox, createSandbox, writeSkill } from "./harness";

/** A skill its source no longer has: `skills check` says what to do, `sources mine` keeps it. */

let sandbox: Sandbox;
const cli = (...argv: string[]): Promise<Run> => sandbox.cli(...argv);

beforeEach(async () => {
  sandbox = createSandbox();
  const folder = writeSkill(join(sandbox.root, "src"), "notes");
  await cli("skills", "install", folder);
  rmSync(folder, { recursive: true });
});

afterEach(() => sandbox.cleanup());

describe("a skill gone from its source", () => {
  it("is named by skills check, with the two ways out", async () => {
    const one = await cli("skills", "check", "notes", "--force");
    expect(one.stdout).toContain("source_missing");
    expect(one.stdout).toContain("sources mine notes keeps it as yours");

    const all = await cli("skills", "check", "--all", "--force", "--json");
    expect(all.json<{ sourceMissing: { name: string }[] }>().sourceMissing).toEqual([
      expect.objectContaining({ name: "notes" }),
    ]);
  });

  it("is kept as yours by sources mine, source forgotten, files untouched", async () => {
    await cli("skills", "check", "notes", "--force");
    const run = await cli("sources", "mine", "notes", "--json");
    expect(run.code).toBe(EXIT_OK);
    expect(run.json<unknown[]>()[0]).toMatchObject({
      authored: true,
      sourceRef: null,
      updateStatus: "local_only",
    });
    expect((await cli("skills", "show", "notes")).code).toBe(EXIT_OK);
  });
});
