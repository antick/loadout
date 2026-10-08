import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PRESET_FILE_FORMAT, type PresetFile } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Core } from "../src/core";
import { parsePresetFile } from "../src/presets/share-file";
import { makeSkill, tempDir, createTestCore } from "./helpers";
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
  const core = createTestCore({
    homeDir: home,
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

    const locked = vi.spyOn(bob.ctx.lock, "run");
    const first = await bob.api.presets.importFile(file);
    expect(first).toMatchObject({ installed: ["pdf", "notes"], reused: [], failed: [] });
    // The switch turned off on import is a preset edit like any other: under the library lock.
    expect(locked.mock.calls.map(([name]) => name)).toContainEqual(
      expect.stringContaining("in the preset Team"),
    );
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

  it("clones a repository once, however the file spells its address", async () => {
    const remote = join(temp.dir, "remotes", "acme", "skills.git");
    makeSkill(join(remote, "skills"), "docx");
    commitAll(remote, "docx");
    const file = join(temp.dir, "spelled.json");
    writeFileSync(
      file,
      JSON.stringify({
        format: PRESET_FILE_FORMAT,
        version: 1,
        name: "Spelled",
        skills: [
          { name: "pdf", source: { url: REPO, subpath: "skills/pdf" } },
          { name: "docx", source: { url: `${REPO}.git/`, subpath: "skills/docx" } },
        ],
      }),
    );
    const bob = newCore("bob");
    const previews = vi.spyOn(bob.api.install, "previewGit");
    const result = await bob.api.presets.importFile(file);
    expect(result).toMatchObject({ installed: ["pdf", "docx"], failed: [] });
    expect(previews).toHaveBeenCalledTimes(1);
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

/** A preset file of one `pdf` skill from `source`. */
function presetOf(source: NonNullable<PresetFile["skills"][number]["source"]>): string {
  const file = join(temp.dir, "one.json");
  writeFileSync(
    file,
    JSON.stringify({
      format: PRESET_FILE_FORMAT,
      version: 1,
      name: "One",
      skills: [{ name: "pdf", source }],
    }),
  );
  return file;
}

describe("importing again after an import got nothing in", () => {
  it("fills the empty preset it left instead of making another", async () => {
    const remote = join(temp.dir, "remotes", "acme", "skills.git");
    const away = `${remote}-away`;
    renameSync(remote, away);
    const bob = newCore("bob");
    const file = presetOf({ url: REPO });
    const offline = await bob.api.presets.importFile(file);
    expect(offline.installed).toEqual([]);
    expect(offline.preset.skillIds).toEqual([]);

    renameSync(away, remote);
    const again = await bob.api.presets.importFile(file);
    expect(again.installed).toEqual(["pdf"]);
    expect(again.preset.id).toBe(offline.preset.id);
    expect((await bob.api.presets.list()).map((preset) => preset.name)).toEqual(["One"]);
  });
});

describe("importing beside a library skill that only shares the name", () => {
  it("installs the file's skill from its source when the library's one has none", async () => {
    const { core: alice, presetId, file } = await sharedLibrary();
    await alice.api.presets.exportFile(presetId, file);
    const bob = newCore("bob");
    const own = await bob.api.skills.create({ name: "pdf", description: "My own PDF notes." });

    const plan = await bob.api.presets.previewImport(file);
    expect(plan.skills[0]).toMatchObject({
      name: "pdf",
      state: "source",
      librarySkillId: null,
      sameNameSkillId: own.id,
    });

    const result = await bob.api.presets.importFile(file);
    expect(result.reused).not.toContain("pdf");
    expect(result.preset.skillIds).not.toContain(own.id);
    const used = (await bob.api.skills.list()).filter((skill) =>
      result.preset.skillIds.includes(skill.id),
    );
    expect(used.find((skill) => skill.sourceType === "git")).toMatchObject({
      sourceSubpath: "skills/pdf",
      name: "pdf-2",
    });
    expect(await bob.api.skills.get(own.id)).toMatchObject({
      name: "pdf",
      sourceType: own.sourceType,
    });
  });

  it("does not take a same-name skill from another repository for it", async () => {
    const other = initRepo(join(temp.dir, "remotes", "other", "skills.git"));
    makeSkill(join(other, "skills"), "pdf", { description: "Another PDF skill entirely." });
    commitAll(other, "initial");
    const { core: alice, presetId, file } = await sharedLibrary();
    await alice.api.presets.exportFile(presetId, file);
    const bob = newCore("bob");
    const preview = await bob.api.install.previewGit("https://github.com/other/skills");
    const [theirs] = await bob.api.install.confirmGit(preview.previewId, [
      { relPath: preview.skills[0]?.relPath ?? "", name: "pdf" },
    ]);

    const plan = await bob.api.presets.previewImport(file);
    expect(plan.skills[0]).toMatchObject({ state: "source", sameNameSkillId: theirs!.id });
    const result = await bob.api.presets.importFile(file);
    expect(result.preset.skillIds).not.toContain(theirs!.id);
    expect(result.installed).toContain("pdf");
  });

  it("names the file's source, not the library's local skill of that name", async () => {
    const bob = newCore("bob");
    const own = await bob.api.install.fromPath(makeSkill(join(temp.dir, "src"), "pdf"));
    const plan = await bob.api.presets.previewImport(
      presetOf({ url: "https://github.com/other/repo.git", subpath: "skills/pdf" }),
    );
    expect(plan.skills[0]).toMatchObject({
      state: "source",
      from: "other/repo",
      sameNameSkillId: own.id,
    });
  });

  it("counts another branch of the same repository as another source", async () => {
    const { core: bob } = await sharedLibrary();
    const pdf = (await bob.api.skills.list()).find((skill) => skill.name === "pdf");
    const same = await bob.api.presets.previewImport(
      presetOf({ url: REPO, subpath: "skills/pdf" }),
    );
    expect(same.skills[0]).toMatchObject({ state: "library", librarySkillId: pdf?.id });
    const other = await bob.api.presets.previewImport(
      presetOf({ url: REPO, branch: "dev", subpath: "skills/pdf" }),
    );
    expect(other.skills[0]).toMatchObject({ state: "source", sameNameSkillId: pdf?.id });
  });

  it("uses the library's skill of that name only when asked to", async () => {
    const bob = newCore("bob");
    const own = await bob.api.install.fromPath(makeSkill(join(temp.dir, "src"), "pdf"));
    const file = presetOf({ url: "https://github.com/other/repo.git", subpath: "skills/pdf" });
    const plan = await bob.api.presets.previewImport(file, { reuseSameName: ["PDF"] });
    expect(plan.skills[0]).toMatchObject({
      state: "library",
      librarySkillId: own.id,
      sameNameSkillId: own.id,
    });
    const result = await bob.api.presets.importFile(file, { reuseSameName: ["pdf"] });
    expect(result).toMatchObject({ installed: [], reused: ["pdf"], failed: [] });
    expect(result.preset.skillIds).toEqual([own.id]);
  });

  it("uses a same-name skill without a source only when its files are the same", async () => {
    const { core: alice, presetId, file } = await sharedLibrary();
    await alice.api.presets.exportFile(presetId, file);
    const bob = newCore("bob");
    const own = await bob.api.skills.create({ name: "notes", description: "Bob's own notes." });

    const plan = await bob.api.presets.previewImport(file);
    expect(plan.skills[1]).toMatchObject({
      name: "notes",
      state: "files",
      sameNameSkillId: own.id,
    });
    const result = await bob.api.presets.importFile(file);
    expect(result.preset.skillIds).not.toContain(own.id);
    expect(result.installed).toContain("notes");
    const folders = async (): Promise<string[]> =>
      (await bob.api.skills.list()).map((skill) => skill.dirName).sort();
    expect(await folders()).toEqual(["notes", "notes-2", "pdf"]);

    // Importing again finds the copy it installed, not Bob's own, and adds no third.
    const again = await bob.api.presets.importFile(file);
    expect(again.preset.skillIds).not.toContain(own.id);
    expect(await folders()).toEqual(["notes", "notes-2", "pdf"]);

    // A same-name skill holding the very same files is the file's skill.
    const carol = newCore("carol");
    await carol.api.presets.importFile(file);
    const carolNotes = (await carol.api.skills.list()).find((skill) => skill.name === "notes");
    const plan2 = await carol.api.presets.previewImport(file);
    expect(plan2.skills[1]).toMatchObject({
      state: "library",
      librarySkillId: carolNotes?.id,
      sameNameSkillId: null,
    });
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
