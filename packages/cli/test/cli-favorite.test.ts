import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_OK } from "../src/run";
import { type Run, type Sandbox, createSandbox, writeSkill } from "./harness";

let sandbox: Sandbox;
const cli = (...argv: string[]): Promise<Run> => sandbox.cli(...argv);

beforeEach(async () => {
  sandbox = createSandbox();
  for (const name of ["alpha", "beta"]) {
    writeSkill(join(sandbox.root, "src"), name);
    await cli("skills", "install", `./src/${name}`);
  }
});

afterEach(() => sandbox.cleanup());

describe("skills favorite", () => {
  it("marks skills, lists only them, and takes the mark back", async () => {
    const marked = await cli("skills", "favorite", "alpha");
    expect(marked.code).toBe(EXIT_OK);
    expect(marked.stdout).toContain("Favorites: alpha.");

    const only = await cli("skills", "list", "--favorites", "--json");
    expect(only.json<{ name: string }[]>().map((skill) => skill.name)).toEqual(["alpha"]);
    expect((await cli("skills", "list")).stdout).toContain("alpha [fav]");
    expect((await cli("skills", "show", "alpha")).stdout).toContain("Favorite");

    const undone = await cli("skills", "favorite", "alpha", "--undo", "--json");
    expect(undone.json<{ favoritedAt: number | null }[]>()[0]?.favoritedAt).toBeNull();
    expect((await cli("skills", "list", "--favorites", "--json")).json()).toEqual([]);
  });
});
