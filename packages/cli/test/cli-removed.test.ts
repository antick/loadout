import { existsSync } from "node:fs";
import { join } from "node:path";
import type { RemovedFolder } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_FAILED, EXIT_OK, EXIT_USAGE } from "../src/run";
import { type Run, type Sandbox, createSandbox, writeSkill } from "./harness";

let sandbox: Sandbox;
const cli = (...argv: string[]): Promise<Run> => sandbox.cli(...argv);

beforeEach(() => {
  sandbox = createSandbox();
});

afterEach(() => sandbox.cleanup());

async function removeAlpha(): Promise<RemovedFolder> {
  writeSkill(join(sandbox.root, "src"), "alpha");
  await cli("skills", "install", "./src/alpha");
  await cli("skills", "tag", "alpha", "--add", "writing");
  const removed = await cli("skills", "remove", "alpha", "--yes");
  expect(removed.stdout).toContain("Kept in Recently removed for 30 days");
  const [entry] = (await cli("removed", "list", "--json")).json<RemovedFolder[]>();
  if (!entry) throw new Error("nothing was kept");
  return entry;
}

describe("removed", () => {
  it("lists a deleted skill and puts it back by a short id", async () => {
    const entry = await removeAlpha();
    expect(entry).toMatchObject({ name: "alpha", place: "Library", library: true });
    const listed = await cli("removed", "list");
    expect(listed.stdout).toContain(entry.id.slice(0, 8));
    expect(listed.stdout).toContain("alpha");

    const tooShort = await cli("removed", "restore", entry.id.slice(0, 4));
    expect(tooShort.code).toBe(EXIT_USAGE);

    const restored = await cli("removed", "restore", entry.id.slice(0, 8));
    expect(restored.code).toBe(EXIT_OK);
    expect(restored.stdout).toContain("It is in the library again.");
    const skills = (await cli("skills", "list", "--json")).json<
      { name: string; tags: string[] }[]
    >();
    expect(skills).toMatchObject([{ name: "alpha", tags: ["writing"] }]);
    expect((await cli("removed", "list", "--json")).json()).toEqual([]);
  });

  it("deletes for good only with --yes", async () => {
    const entry = await removeAlpha();
    const refused = await cli("removed", "delete", entry.id);
    expect(refused.code).toBe(EXIT_USAGE);
    const dry = await cli("removed", "delete", entry.id, "--dry-run");
    expect(dry.stdout).toContain("Nothing was changed.");
    expect((await cli("removed", "list", "--json")).json()).toHaveLength(1);

    const deleted = await cli("removed", "delete", entry.id, "--yes");
    expect(deleted.code).toBe(EXIT_OK);
    expect((await cli("removed", "list", "--json")).json()).toEqual([]);
    expect(existsSync(join(sandbox.libraryDir, "skills", "alpha"))).toBe(false);
  });

  it("fails on an id that is not there", async () => {
    const run = await cli("removed", "restore", "00000000", "--json");
    expect(run.code).toBe(EXIT_FAILED);
    expect(run.json()).toMatchObject({ code: "NOT_FOUND" });
  });
});
