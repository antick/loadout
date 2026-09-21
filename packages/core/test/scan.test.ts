import { existsSync, mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashDir } from "../src/util/hash";
import { type TestWorld, createTestWorld, makeSkill } from "./helpers";
import { type InstallHarness, createInstallHarness, skillsDirOf } from "./install-fixtures";

let world: TestWorld;
let install: InstallHarness;
let claude: string;
let cursor: string;

beforeEach(() => {
  world = createTestWorld();
  install = createInstallHarness(world);
  claude = join(world.home, ".claude", "skills");
  cursor = join(world.home, ".cursor", "skills");
  mkdirSync(claude, { recursive: true });
  mkdirSync(cursor, { recursive: true });
});

afterEach(() => world.cleanup());

describe("scanning agent folders", () => {
  it("groups the same skill found under several agents and keeps different content apart", async () => {
    makeSkill(claude, "shared");
    makeSkill(cursor, "shared");
    makeSkill(claude, "forked", { body: "claude edition" });
    makeSkill(cursor, "forked", { body: "cursor edition" });
    mkdirSync(join(claude, "not-a-skill"));
    // Flat agents look at direct children only.
    makeSkill(join(claude, "category"), "too-deep");

    const result = await install.api.scanLocal();

    expect(result.skillsFound).toBe(4);
    expect(result.skills.map((s) => [s.name, s.locations.length, s.imported])).toEqual([
      ["forked", 1, false],
      ["forked", 1, false],
      ["shared", 2, false],
    ]);
    const shared = result.skills.find((s) => s.name === "shared");
    expect(shared).toMatchObject({
      description: "Test skill shared",
      fingerprint: hashDir(join(claude, "shared")),
    });
    expect(shared?.locations).toEqual(
      expect.arrayContaining([
        { agentKey: "claude_code", path: join(claude, "shared") },
        { agentKey: "cursor", path: join(cursor, "shared") },
      ]),
    );
    // Only agents that exist on this machine are scanned.
    expect(result.agentsScanned).toBe(2);
  });

  it("searches nested folders for agents that keep skills in categories", async () => {
    const hermes = join(world.home, ".hermes", "skills");
    makeSkill(join(hermes, "writing", "long-form"), "essay", { files: { "inner/SKILL.md": "x" } });
    makeSkill(hermes, "top-level");

    const result = await install.api.scanLocal();
    expect(result.skills.map((s) => s.name)).toEqual(["essay", "top-level"]);
    expect(result.skills[0]?.locations).toEqual([
      { agentKey: "hermes", path: join(hermes, "writing", "long-form", "essay") },
    ]);
  });

  it("scans an agent's extra folders even when the agent itself is not installed", async () => {
    makeSkill(join(world.home, ".agents", "skills"), "portable");
    const result = await install.api.scanLocal();
    const portable = result.skills.find((s) => s.name === "portable");
    expect(portable?.locations.map((l) => l.agentKey)).toContain("codex");
    expect(result.skillsFound).toBe(1);
  });

  it("skips what Loadout deployed itself: recorded targets and links into the library", async () => {
    const library = await install.api.fromPath(makeSkill(join(world.root, "src"), "mine"));
    // A copy deployment is a plain folder; only the deployments row says it is ours.
    const copied = makeSkill(claude, "mine-copy", { body: "deployed copy" });
    world.store.upsertDeployment(library.id, "claude_code", copied, "copy", library.contentHash);
    // A link into the library with no row (left by an older install) is still ours.
    symlinkSync(library.libraryPath, join(cursor, "mine"));
    makeSkill(cursor, "theirs");

    const result = await install.api.scanLocal();
    expect(result.skills.map((s) => s.name)).toEqual(["theirs"]);
  });

  it("marks a skill imported by its source path, else by equal content", async () => {
    const byPath = makeSkill(claude, "by-path");
    await install.api.importDiscovered(byPath);
    makeSkill(claude, "by-path", { body: "edited after the import" });

    const twin = makeSkill(join(world.root, "src"), "twin");
    await install.api.fromPath(twin);
    makeSkill(cursor, "twin");
    makeSkill(cursor, "fresh");

    const result = await install.api.scanLocal();
    expect(result.skills.map((s) => [s.name, s.imported])).toEqual([
      ["by-path", true],
      ["fresh", false],
      ["twin", true],
    ]);
  });
});

describe("importing discovered skills", () => {
  it("copies into the library without deploying or adopting the original", async () => {
    const found = makeSkill(claude, "found", { files: { "data.txt": "d" } });
    await install.api.scanLocal();
    const skill = await install.api.importDiscovered(found, "Renamed");

    expect(skill).toMatchObject({
      name: "Renamed",
      sourceType: "import",
      sourceRef: found,
      updateStatus: "local_only",
      deployments: [],
      libraryPath: join(skillsDirOf(world), "Renamed"),
    });
    expect(existsSync(join(found, "data.txt"))).toBe(true);
    expect(world.store.deployments()).toEqual([]);
    expect(world.ctx.activity.list()[0]).toMatchObject({ kind: "import", subject: "Renamed" });
  });

  it("leaves a library skill that already owns the destination untouched", async () => {
    const tracked = await install.api.fromPath(makeSkill(join(world.root, "src"), "same"));
    const again = await install.api.importDiscovered(makeSkill(claude, "same"));
    expect(again.id).toBe(tracked.id);
    expect(again.sourceType).toBe("local");
    expect(world.store.list()).toHaveLength(1);
  });

  it("rejects a path that is not a skill folder", async () => {
    mkdirSync(join(claude, "plain"));
    await expect(install.api.importDiscovered(join(claude, "plain"))).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });

  it("imports every group once, from its first location, and reports failures", async () => {
    makeSkill(claude, "shared");
    makeSkill(cursor, "shared");
    makeSkill(claude, "solo");
    await install.api.fromPath(makeSkill(join(world.root, "src"), "known"));
    makeSkill(cursor, "known");

    const result = await install.api.importAllDiscovered();
    expect(result).toEqual({ imported: 2, skipped: 1, errors: [] });
    expect(world.store.list().map((s) => [s.name, s.sourceType])).toEqual([
      ["known", "local"],
      ["shared", "import"],
      ["solo", "import"],
    ]);
    // Running it again finds nothing left to do.
    expect(await install.api.importAllDiscovered()).toEqual({
      imported: 0,
      skipped: 3,
      errors: [],
    });
    expect((await install.api.scanLocal()).skills.every((s) => s.imported)).toBe(true);
  });
});
