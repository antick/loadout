import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_FAILED, EXIT_OK, EXIT_USAGE } from "../src/run";
import { type Sandbox, createSandbox, writeSkill } from "./harness";

let alice: Sandbox;
let bob: Sandbox;

beforeEach(() => {
  alice = createSandbox();
  bob = createSandbox();
});

afterEach(() => {
  alice.cleanup();
  bob.cleanup();
});

describe("presets export and import", () => {
  it("carries a preset and its hand-made skills to another library", async () => {
    writeSkill(join(alice.root, "src"), "notes");
    await alice.cli("skills", "install", "./src/notes");
    await alice.cli("presets", "create", "Web kit");
    await alice.cli("presets", "add", "Web kit", "notes");

    const out = await alice.cli("presets", "export", "Web kit");
    expect(out.code).toBe(EXIT_OK);
    const file = join(alice.root, "web-kit.loadout-preset.json");
    expect(existsSync(file)).toBe(true);
    expect(out.stdout).toContain("1 skill without a source went in with its files");
    // The file is there now: writing over it needs --yes.
    const again = await alice.cli("presets", "export", "Web kit");
    expect(again.code).toBe(EXIT_USAGE);
    expect(again.stderr).toContain("already exists");
    expect((await alice.cli("presets", "export", "Web kit", "--yes")).code).toBe(EXIT_OK);

    const dry = await bob.cli("presets", "import", file, "--dry-run");
    expect(dry.stdout).toMatch(/notes\s+install from the file/);
    expect((await bob.cli("presets", "list")).stdout).toContain("No presets yet.");

    const run = await bob.cli("presets", "import", file);
    expect(run.code).toBe(EXIT_OK);
    expect(run.stdout).toContain("Created preset Web kit with 1 skill.");
    expect(run.stdout).toContain("Installed: notes");
    expect((await bob.cli("presets", "show", "Web kit")).stdout).toContain("notes");
  });

  it("fails with exit 1 when a skill cannot be had, keeping the rest", async () => {
    writeSkill(join(alice.root, "src"), "notes");
    await alice.cli("skills", "install", "./src/notes");
    await alice.cli("presets", "create", "Thin");
    await alice.cli("presets", "add", "Thin", "notes");
    await alice.cli("presets", "export", "Thin", "--no-files", "--out", "./thin.json");

    const run = await bob.cli("presets", "import", join(alice.root, "thin.json"));
    expect(run.code).toBe(EXIT_FAILED);
    expect(run.stdout).toContain("Not added: notes");
  });
});
