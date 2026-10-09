import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { SkillLocation } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type EditorService, createFileHistory } from "../src/editor";
import { hashDir } from "../src/util/hash";
import { createEditorWorld, libraryLocation as lib, rejection } from "./editor-world";
import { makeSkill, writeFile } from "./helpers";
import type { UpdatesWorld } from "./updates-world";

let world: UpdatesWorld;
let editor: EditorService;

beforeEach(() => {
  ({ world, editor } = createEditorWorld());
});
afterEach(() => world.restore());

const ed = () => editor.api;

describe("creating files and folders", () => {
  it("creates an empty file with the folders on its way, and records the edit", async () => {
    const skill = world.addSkill("alpha");
    const result = await ed().createFile(lib(skill.id), "references/deep/notes.md");

    expect(result.path).toBe("references/deep/notes.md");
    expect(readFileSync(join(skill.libraryPath, "references", "deep", "notes.md"), "utf8")).toBe(
      "",
    );
    expect(result.skill).toMatchObject({
      contentHash: hashDir(skill.libraryPath),
      editedFiles: ["references/deep/notes.md"],
    });
    expect(result.skill.contentHash).not.toBe(skill.contentHash);
    expect(world.ctx.activity.list(1)[0]).toMatchObject({
      kind: "edit",
      detail: "Created references/deep/notes.md",
    });
    const files = await ed().files(lib(skill.id));
    expect(files.map((file) => file.path)).toEqual(["SKILL.md", "references/deep/notes.md"]);
    expect(files[1]?.edited).toBe(true);
  });

  it("creates an empty folder, which the folder list shows", async () => {
    const skill = world.addSkill("alpha", { "scripts/run.sh": "echo\n" });
    const result = await ed().createFolder(lib(skill.id), "assets/icons");
    expect(result).toMatchObject({ path: "assets/icons", copiesRefreshed: 0 });
    expect(result.skill.editedFiles).toEqual([]);
    expect(await ed().folders(lib(skill.id))).toEqual(["assets", "assets/icons", "scripts"]);
  });

  it("refuses taken names, paths outside the skill, .git and unportable names", async () => {
    const skill = world.addSkill("alpha", { "notes.md": "mine\n" });
    const location = lib(skill.id);

    expect((await rejection(ed().createFile(location, "notes.md"))).code).toBe("ALREADY_EXISTS");
    expect((await rejection(ed().createFolder(location, "notes.md"))).code).toBe("ALREADY_EXISTS");
    expect((await rejection(ed().createFile(location, "../escape.md"))).code).toBe("INVALID_INPUT");
    expect((await rejection(ed().createFile(location, ".git/config"))).code).toBe("UNSUPPORTED");
    expect((await rejection(ed().createFolder(location, ".git"))).code).toBe("UNSUPPORTED");
    expect((await rejection(ed().createFile(location, "what?.md"))).code).toBe("INVALID_INPUT");
    expect((await rejection(ed().createFile(location, "notes.md/inner.md"))).code).toBe(
      "INVALID_INPUT",
    );
    expect((await rejection(ed().createFile(location, "  "))).code).toBe("INVALID_INPUT");
    expect(readFileSync(join(skill.libraryPath, "notes.md"), "utf8")).toBe("mine\n");
    expect(existsSync(join(skill.libraryPath, "..", "escape.md"))).toBe(false);
  });

  it("refuses to follow a linked folder out of the skill", async () => {
    const skill = world.addSkill("alpha");
    const outside = join(world.root, "outside");
    mkdirSync(outside);
    symlinkSync(outside, join(skill.libraryPath, "linked"));
    expect((await rejection(ed().createFile(lib(skill.id), "linked/new.md"))).code).toBe(
      "INVALID_INPUT",
    );
    expect(existsSync(join(outside, "new.md"))).toBe(false);
  });

  it("changes library skills only", async () => {
    makeSkill(join(world.home, ".claude", "skills"), "local-one");
    const location: SkillLocation = {
      kind: "agent",
      agentKey: "claude_code",
      relativePath: "local-one",
    };
    expect((await rejection(ed().createFile(location, "new.md"))).code).toBe("UNSUPPORTED");
    expect(existsSync(join(world.home, ".claude", "skills", "local-one", "new.md"))).toBe(false);
  });
});

describe("renaming", () => {
  it("renames and moves a file, marking the new path as edited", async () => {
    const skill = world.addSkill("alpha", { "notes.md": "notes\n" });
    const result = await ed().renameFile(lib(skill.id), "notes.md", "docs/guide.md");

    expect(result.path).toBe("docs/guide.md");
    expect(existsSync(join(skill.libraryPath, "notes.md"))).toBe(false);
    expect(readFileSync(join(skill.libraryPath, "docs", "guide.md"), "utf8")).toBe("notes\n");
    expect(result.skill).toMatchObject({
      contentHash: hashDir(skill.libraryPath),
      editedFiles: ["docs/guide.md"],
    });
    expect(world.ctx.activity.list(1)[0]?.detail).toBe("Renamed notes.md to docs/guide.md");
  });

  it("renames a folder with everything in it", async () => {
    const skill = world.addSkill("alpha", { "scripts/a.sh": "a\n", "scripts/sub/b.sh": "b\n" });
    const result = await ed().renameFile(lib(skill.id), "scripts", "tools");
    expect(result.skill.editedFiles).toEqual(["tools/a.sh", "tools/sub/b.sh"]);
    expect(readFileSync(join(skill.libraryPath, "tools", "sub", "b.sh"), "utf8")).toBe("b\n");
    expect(await ed().folders(lib(skill.id))).toEqual(["tools", "tools/sub"]);
  });

  it("changes only the case of a name", async () => {
    const skill = world.addSkill("alpha", { "notes.md": "notes\n" });
    await ed().renameFile(lib(skill.id), "notes.md", "Notes.md");
    const paths = (await ed().files(lib(skill.id))).map((file) => file.path);
    expect(paths).toEqual(["SKILL.md", "Notes.md"]);
  });

  it("never renames the main document or the folder holding it, nor onto a taken name", async () => {
    const skill = world.addSkill("alpha", { "a.md": "a\n", "b.md": "b\n", "dir/c.md": "c\n" });
    const location = lib(skill.id);
    expect((await rejection(ed().renameFile(location, "SKILL.md", "README.md"))).code).toBe(
      "INVALID_INPUT",
    );
    expect((await rejection(ed().renameFile(location, "a.md", "b.md"))).code).toBe(
      "ALREADY_EXISTS",
    );
    expect((await rejection(ed().renameFile(location, "a.md", "../a.md"))).code).toBe(
      "INVALID_INPUT",
    );
    expect((await rejection(ed().renameFile(location, "dir", "dir/inner"))).code).toBe(
      "INVALID_INPUT",
    );
    expect((await rejection(ed().renameFile(location, "gone.md", "x.md"))).code).toBe("NOT_FOUND");
    expect((await rejection(ed().renameFile(location, "a.md", ".git"))).code).toBe("UNSUPPORTED");
    expect(readFileSync(join(skill.libraryPath, "a.md"), "utf8")).toBe("a\n");
    expect(existsSync(join(skill.libraryPath, "SKILL.md"))).toBe(true);
  });

  it("protects a main document that lives in a subfolder", async () => {
    const skill = world.addSkill("alpha", { "inner/notes.md": "notes\n" });
    renameSync(join(skill.libraryPath, "SKILL.md"), join(skill.libraryPath, "inner", "SKILL.md"));
    const location = lib(skill.id);
    expect((await rejection(ed().renameFile(location, "inner", "other"))).code).toBe(
      "INVALID_INPUT",
    );
    expect((await rejection(ed().deleteFile(location, "inner"))).code).toBe("INVALID_INPUT");
    await ed().deleteFile(location, "inner/notes.md");
    expect(existsSync(join(skill.libraryPath, "inner", "SKILL.md"))).toBe(true);
  });
});

describe("earlier versions", () => {
  it("keeps versions of a file whose key is too long for a folder name", () => {
    const history = createFileHistory(world.ctx.paths.historyDir);
    const deep = `instructions:${"/a-rather-long-folder-name".repeat(20)}/CLAUDE.md`;
    history.record(deep, "CLAUDE.md", Buffer.from("old\n"), 1_000);
    expect(history.list(deep, "CLAUDE.md").map((version) => version.id)).toEqual(["1000"]);
    expect(history.read(deep, "CLAUDE.md", "1000")).toBe("old\n");
    // Short keys keep the folder names they always had, so older history is still found.
    history.record("skill-1", "notes.md", Buffer.from("old\n"), 1_000);
    expect(existsSync(join(world.ctx.paths.historyDir, "skill-1", "notes.md", "1000.bak"))).toBe(
      true,
    );
  });

  it("saves the file even when its earlier version cannot be kept", async () => {
    const skill = world.addSkill("alpha", { "notes.md": "one\n" });
    rmSync(world.ctx.paths.historyDir, { recursive: true, force: true });
    writeFileSync(world.ctx.paths.historyDir, "not a folder");
    const file = await ed().readFile(lib(skill.id), "notes.md");
    await ed().saveFile(lib(skill.id), { path: "notes.md", content: "two\n", baseHash: file.hash });
    expect(readFileSync(join(skill.libraryPath, "notes.md"), "utf8")).toBe("two\n");
  });
});

describe("deleting", () => {
  it("keeps the file as an earlier version first, so it can be brought back", async () => {
    const skill = world.addSkill("alpha", { "notes.md": "keep me\n" });
    const result = await ed().deleteFile(lib(skill.id), "notes.md");

    expect(result.path).toBe("notes.md");
    expect(existsSync(join(skill.libraryPath, "notes.md"))).toBe(false);
    expect(result.skill).toMatchObject({
      contentHash: hashDir(skill.libraryPath),
      editedFiles: ["notes.md"],
    });
    const versions = await ed().fileVersions(lib(skill.id), "notes.md");
    expect(versions).toHaveLength(1);
    expect(await ed().readFileVersion(lib(skill.id), "notes.md", versions[0]?.id ?? "")).toBe(
      "keep me\n",
    );
    expect(world.ctx.activity.list(1)[0]?.detail).toBe("Deleted notes.md");
  });

  it("deletes a folder, keeping every file in it the editor could open", async () => {
    const skill = world.addSkill("alpha", { "scripts/a.sh": "a\n", "scripts/sub/b.sh": "b\n" });
    writeFileSync(join(skill.libraryPath, "scripts", "tool.bin"), Buffer.from([0, 1, 2, 0]));
    await ed().deleteFile(lib(skill.id), "scripts");
    expect(existsSync(join(skill.libraryPath, "scripts"))).toBe(false);
    expect(await ed().fileVersions(lib(skill.id), "scripts/sub/b.sh")).toHaveLength(1);
    // A binary could never be shown from the history, so it is not copied there.
    expect(await ed().fileVersions(lib(skill.id), "scripts/tool.bin")).toHaveLength(0);
    expect(await ed().folders(lib(skill.id))).toEqual([]);
  });

  it("never deletes the main document", async () => {
    const skill = world.addSkill("alpha");
    expect((await rejection(ed().deleteFile(lib(skill.id), "SKILL.md"))).code).toBe(
      "INVALID_INPUT",
    );
    expect(existsSync(join(skill.libraryPath, "SKILL.md"))).toBe(true);
  });
});

describe("deployed copies", () => {
  it("gives every change to untouched copies and leaves edited copies alone", async () => {
    world.installAgents(".codex");
    world.ctx.settings.set("deployMode", "copy");
    const skill = world.addSkill("alpha", { "notes.md": "notes\n" });
    await world.deploy.api.deploy(skill.id, "claude_code");
    await world.deploy.api.deploy(skill.id, "codex");
    const claudeCopy = world.claudeTarget("alpha");
    const codexCopy = world.store.deployment(skill.id, "codex")?.targetPath ?? "";
    writeFile(join(codexCopy, "SKILL.md"), "edited inside codex\n");

    const created = await ed().createFile(lib(skill.id), "extra.md");
    expect(created).toMatchObject({ copiesRefreshed: 1, copiesKept: ["codex"] });
    expect(existsSync(join(claudeCopy, "extra.md"))).toBe(true);
    expect(existsSync(join(codexCopy, "extra.md"))).toBe(false);

    await ed().renameFile(lib(skill.id), "notes.md", "guide.md");
    expect(existsSync(join(claudeCopy, "notes.md"))).toBe(false);
    expect(readFileSync(join(claudeCopy, "guide.md"), "utf8")).toBe("notes\n");

    const deleted = await ed().deleteFile(lib(skill.id), "guide.md");
    expect(deleted.copiesRefreshed).toBe(1);
    expect(existsSync(join(claudeCopy, "guide.md"))).toBe(false);
    expect(readFileSync(join(codexCopy, "notes.md"), "utf8")).toBe("notes\n");
  });
});
