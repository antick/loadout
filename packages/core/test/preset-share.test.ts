import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PRESET_FILE_FORMAT, type PresetFile } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Core, createCore } from "../src/core";
import { silentLogger } from "../src/log";
import { parsePresetFile } from "../src/presets/share-file";
import { makeSkill, tempDir } from "./helpers";
import { commitAll, initRepo, redirectGithubTo } from "./install-fixtures";

const REPO = "https://github.com/acme/skills";

let temp: { dir: string; cleanup: () => void };
let restore: () => void;
const cores: Core[] = [];

/** A fresh library in its own home folder, with Claude Code and Cursor installed. */
function newCore(name: string): Core {
  const home = join(temp.dir, name);
  mkdirSync(join(home, ".claude"), { recursive: true });
  mkdirSync(join(home, ".cursor"), { recursive: true });
  const core = createCore({
    homeDir: home,
    configDir: join(home, "config"),
    logger: silentLogger,
    safetyScannerPath: null,
  });
  cores.push(core);
  return core;
}

beforeEach(() => {
  temp = tempDir();
  const remotes = join(temp.dir, "remotes");
  restore = redirectGithubTo(remotes);
  const remote = initRepo(join(remotes, "acme", "skills.git"));
  makeSkill(join(remote, "skills"), "pdf", { files: { "scripts/run.sh": "echo pdf" } });
  commitAll(remote, "initial");
});

afterEach(() => {
  for (const core of cores.splice(0)) core.close();
  restore();
  temp.cleanup();
});

/** A library with `pdf` from the repository, a hand-made `notes`, and a preset of both. */
async function sharedLibrary(): Promise<{ core: Core; presetId: string; file: string }> {
  const core = newCore("alice");
  const preview = await core.api.install.previewGit(REPO);
  const found = preview.skills.find((skill) => skill.name === "pdf");
  const [pdf] = await core.api.install.confirmGit(preview.previewId, [
    { relPath: found?.relPath ?? "", name: "pdf" },
  ]);
  const notes = await core.api.skills.create({
    name: "notes",
    description: "Take meeting notes. Use when asked to write up a meeting.",
  });
  const preset = await core.api.presets.create({ name: "Team", description: "Our kit" });
  await core.api.presets.addSkills(preset.id, [pdf!.id, notes.id]);
  await core.api.presets.setToggle(preset.id, notes.id, "cursor", false);
  return { core, presetId: preset.id, file: join(temp.dir, "team.loadout-preset.json") };
}

describe("exporting a preset", () => {
  it("writes skills by source, embeds the ones without, and keeps switches", async () => {
    const { core, presetId, file } = await sharedLibrary();
    const result = await core.api.presets.exportFile(presetId, file);
    expect(result).toEqual({ path: file, skills: 2, embedded: 1, nameOnly: [] });
    const written = JSON.parse(readFileSync(file, "utf8")) as PresetFile;
    expect(written).toMatchObject({ format: PRESET_FILE_FORMAT, version: 1, name: "Team" });
    const [pdf, notes] = written.skills;
    expect(pdf?.source).toMatchObject({ subpath: "skills/pdf" });
    expect(pdf?.files).toBeUndefined();
    expect(notes?.files?.["SKILL.md"]?.text).toContain("name: notes");
    expect(notes?.offFor).toEqual(["cursor"]);

    const bare = await core.api.presets.exportFile(presetId, file, { includeFiles: false });
    expect(bare).toMatchObject({ embedded: 0, nameOnly: ["notes"] });
  });

  it("refuses to write into the library", async () => {
    const { core, presetId } = await sharedLibrary();
    await expect(
      core.api.presets.exportFile(presetId, join(core.ctx.paths.skillsDir, "x.json")),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

describe("importing a preset", () => {
  it("installs what the library lacks, then reuses it the next time", async () => {
    const { core: alice, presetId, file } = await sharedLibrary();
    await alice.api.presets.exportFile(presetId, file);

    const bob = newCore("bob");
    const plan = await bob.api.presets.previewImport(file);
    expect(plan).toMatchObject({ name: "Team", nameTaken: false });
    expect(plan.skills.map((skill) => [skill.name, skill.state, skill.from])).toEqual([
      ["pdf", "source", "acme/skills"],
      ["notes", "files", null],
    ]);

    const first = await bob.api.presets.importFile(file);
    expect(first).toMatchObject({ installed: ["pdf", "notes"], reused: [], failed: [] });
    expect(first.preset).toMatchObject({ name: "Team", description: "Our kit" });
    expect(first.preset.skillIds).toHaveLength(2);
    const library = await bob.api.skills.list();
    const pdf = library.find((skill) => skill.name === "pdf");
    const notes = library.find((skill) => skill.name === "notes");
    expect(pdf).toMatchObject({ sourceType: "git", sourceSubpath: "skills/pdf" });
    expect(notes).toMatchObject({ sourceType: "import", sourceRef: null });
    const toggles = await bob.api.presets.toggles(first.preset.id, notes!.id);
    expect(toggles.find((toggle) => toggle.agentKey === "cursor")?.enabled).toBe(false);

    expect((await bob.api.presets.previewImport(file)).nameTaken).toBe(true);
    const second = await bob.api.presets.importFile(file);
    expect(second).toMatchObject({ installed: [], reused: ["pdf", "notes"] });
    expect(second.preset.name).toBe("Team 2");
    const named = await bob.api.presets.importFile(file, { name: "Mine" });
    expect(named.preset.name).toBe("Mine");
  });

  it("names skills it cannot get, and still makes the preset", async () => {
    const file = join(temp.dir, "thin.json");
    writeFileSync(
      file,
      JSON.stringify({
        format: PRESET_FILE_FORMAT,
        version: 1,
        name: "Thin",
        skills: [{ name: "ghost" }],
      }),
    );
    const bob = newCore("bob");
    const result = await bob.api.presets.importFile(file);
    expect(result.preset.skillIds).toEqual([]);
    expect(result.failed).toEqual([
      { name: "ghost", message: expect.stringContaining("No source") },
    ]);
  });
});

describe("reading a preset file", () => {
  it("refuses what is not one, or is from a newer app", () => {
    expect(() => parsePresetFile("nope")).toThrow(/not JSON/);
    expect(() => parsePresetFile('{"format":"other"}')).toThrow(/not a Loadout preset/);
    expect(() =>
      parsePresetFile(JSON.stringify({ format: PRESET_FILE_FORMAT, version: 99, name: "x" })),
    ).toThrow(/newer Loadout/);
  });

  it("drops files that would leave the skill's folder, and sources that are not links", () => {
    const file = parsePresetFile(
      JSON.stringify({
        format: PRESET_FILE_FORMAT,
        version: 1,
        name: "Risky",
        skills: [
          {
            name: "escape",
            files: { "../../.ssh/config": { text: "x" }, "SKILL.md": { text: "y" } },
          },
          { name: "local", source: { url: "/etc" } },
          {
            name: "ok",
            files: { "SKILL.md": { text: "z" }, "bin/run": { base64: "AA==", executable: true } },
          },
        ],
      }),
    );
    expect(
      file.skills.map((skill) => [skill.name, Boolean(skill.files), Boolean(skill.source)]),
    ).toEqual([
      ["escape", false, false],
      ["local", false, false],
      ["ok", true, false],
    ]);
  });
});
