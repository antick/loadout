import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_OK, EXIT_USAGE } from "../src/run";
import { type Run, type Sandbox, createSandbox, writeSkill } from "./harness";

let sandbox: Sandbox;
const cli = (...argv: string[]): Promise<Run> => sandbox.cli(...argv);

beforeEach(async () => {
  sandbox = createSandbox();
  writeSkill(join(sandbox.root, "src"), "alpha");
  await cli("skills", "install", "./src/alpha");
});

afterEach(() => sandbox.cleanup());

describe("skills note", () => {
  it("sets, shows, finds and clears a note", async () => {
    const set = await cli("skills", "note", "alpha", "  Run it first.  ");
    expect(set.code).toBe(EXIT_OK);
    expect(set.stdout).toContain("alpha:\nRun it first.");

    const shown = await cli("skills", "note", "alpha", "--json");
    expect(shown.json()).toMatchObject({ name: "alpha", note: "Run it first." });
    expect((await cli("skills", "show", "alpha")).stdout).toContain("Note");

    const found = await cli("skills", "list", "--query", "run it", "--json");
    expect(found.json<{ name: string }[]>().map((skill) => skill.name)).toEqual(["alpha"]);

    const cleared = await cli("skills", "note", "alpha", "--clear");
    expect(cleared.stdout).toContain("alpha has no note.");
    expect((await cli("skills", "note", "alpha", "--json")).json()).toMatchObject({ note: null });
  });

  it("refuses a note together with --clear", async () => {
    const both = await cli("skills", "note", "alpha", "text", "--clear");
    expect(both.code).toBe(EXIT_USAGE);
  });
});
