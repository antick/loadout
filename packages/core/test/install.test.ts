import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractArchive } from "../src/install/archive";
import { CancelRegistry } from "../src/install/cancel";
import { listRepoSkills, resolveSkillDir } from "../src/install/repo-scan";
import { hashDir } from "../src/util/hash";
import { type TestWorld, createTestWorld, makeSkill, writeFile } from "./helpers";
import {
  type InstallHarness,
  createInstallHarness,
  isolateTmpDir,
  skillsDirOf,
  writeZip,
} from "./install-fixtures";

const SKILL_MD = "---\nname: zipped\ndescription: From an archive\n---\n\n# zipped\n";

let world: TestWorld;
let install: InstallHarness;
let sources: string;
let restoreTmp: () => void;

beforeEach(() => {
  world = createTestWorld();
  restoreTmp = isolateTmpDir(join(world.root, "tmp"));
  install = createInstallHarness(world);
  sources = join(world.root, "sources");
  mkdirSync(sources, { recursive: true });
});

afterEach(() => {
  restoreTmp();
  world.cleanup();
});

describe("install from a folder", () => {
  it("copies the skill and records where it came from", async () => {
    const source = makeSkill(sources, "alpha", { files: { "scripts/run.sh": "echo hi" } });
    const skill = await install.api.fromPath(source);

    expect(skill).toMatchObject({
      name: "alpha",
      dirName: "alpha",
      description: "Test skill alpha",
      sourceType: "local",
      sourceRef: source,
      updateStatus: "local_only",
      libraryPath: join(skillsDirOf(world), "alpha"),
      contentHash: hashDir(source),
      lastCheckError: null,
    });
    expect(readFileSync(join(skill.libraryPath, "scripts/run.sh"), "utf8")).toBe("echo hi");
    expect(world.ctx.activity.list()[0]).toMatchObject({ kind: "install", subject: "alpha" });
  });

  it("uses a given name, sanitised, and never copies .git or symlinks", async () => {
    const source = makeSkill(sources, "alpha", { files: { ".git/config": "x", "notes.md": "n" } });
    symlinkSync(join(sources, "alpha", "notes.md"), join(source, "link.md"));
    const skill = await install.api.fromPath(source, "  ../My Skill?  ");
    expect(skill.name).toBe("My Skill_");
    expect(readdirSync(skill.libraryPath).sort()).toEqual(["SKILL.md", "notes.md"]);
  });

  it("rejects a folder that is not a skill, a missing path and a library folder", async () => {
    mkdirSync(join(sources, "plain"));
    writeFile(join(sources, "plain", "README.md"), "# nope");
    await expect(install.api.fromPath(join(sources, "plain"))).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(install.api.fromPath(join(sources, "missing"))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(install.api.fromPath("relative/path")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    const skill = await install.api.fromPath(makeSkill(sources, "alpha"));
    await expect(install.api.fromPath(skill.libraryPath)).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(world.store.list()).toHaveLength(1);
  });

  it("gives different content under the same name a -2 folder", async () => {
    const first = await install.api.fromPath(makeSkill(sources, "alpha"));
    const other = makeSkill(join(sources, "elsewhere"), "alpha", { body: "different" });
    const second = await install.api.fromPath(other);
    const third = await install.api.fromPath(
      makeSkill(join(sources, "third"), "alpha", { body: "third" }),
    );

    expect(second.id).not.toBe(first.id);
    expect(second.dirName).toBe("alpha-2");
    expect(second.name).toBe("alpha");
    expect(third.dirName).toBe("alpha-3");
    expect(world.store.list()).toHaveLength(3);
  });

  it("reinstalls identical content in place, keeping id, tags and deployments", async () => {
    const source = makeSkill(sources, "alpha");
    const first = await install.api.fromPath(source);
    world.store.setTags(first.id, ["keep"]);
    world.store.upsertDeployment(first.id, "claude_code", "/x/alpha", "symlink", first.contentHash);
    world.store.update(first.id, { lastCheckError: "old failure", updateStatus: "error" });

    const copy = makeSkill(join(sources, "copy"), "alpha");
    const again = await install.api.fromPath(copy);

    expect(again.id).toBe(first.id);
    expect(again.dirName).toBe("alpha");
    expect(again.tags).toEqual(["keep"]);
    expect(again.deployments).toHaveLength(1);
    expect(again.sourceRef).toBe(copy);
    expect(again.lastCheckError).toBeNull();
    expect(again.updateStatus).toBe("local_only");
    expect(world.store.list()).toHaveLength(1);
  });

  it("overwrites a chosen skill in place even when the content changed", async () => {
    const first = await install.api.fromPath(makeSkill(sources, "alpha"));
    world.store.setTags(first.id, ["keep"]);
    const changed = makeSkill(join(sources, "v2"), "alpha", { body: "version two" });

    const replaced = await install.installIntoLibrary({
      sourceDir: changed,
      record: {
        sourceType: "local",
        sourceRef: changed,
        updateStatus: "local_only",
        replaceSkillId: first.id,
      },
    });

    expect(replaced.id).toBe(first.id);
    expect(replaced.libraryPath).toBe(first.libraryPath);
    expect(replaced.tags).toEqual(["keep"]);
    expect(replaced.contentHash).toBe(hashDir(changed));
    expect(readFileSync(join(first.libraryPath, "SKILL.md"), "utf8")).toContain("version two");
    expect(existsSync(join(skillsDirOf(world), "alpha-2"))).toBe(false);
  });
});

describe("install from an archive", () => {
  it("ignores entries that try to leave the unpack folder", async () => {
    const zip = writeZip(join(sources, "evil.zip"), {
      "zipped/SKILL.md": SKILL_MD,
      "zipped/ok.txt": "fine",
      "../escaped.txt": "no",
      "zipped/../../escaped-too.txt": "no",
      "/absolute.txt": "no",
      "C:/windows.txt": "no",
      "..\\backslash.txt": "no",
    });
    const archive = await extractArchive(zip);
    try {
      expect(readdirSync(archive.skillDir).sort()).toEqual(["SKILL.md", "ok.txt"]);
      const unpackParent = dirname(dirname(archive.skillDir));
      expect(readdirSync(unpackParent)).toEqual(["evil"]);
      expect(readdirSync(dirname(unpackParent)).filter((n) => n.includes("escaped"))).toEqual([]);
      expect(existsSync("/absolute.txt")).toBe(false);
    } finally {
      await archive.cleanup();
    }
    expect(existsSync(archive.skillDir)).toBe(false);
  });

  it("installs a .skill file, restores the executable bit and cleans up", async () => {
    const zip = writeZip(join(sources, "bundle.skill"), {
      "zipped/SKILL.md": { content: SKILL_MD, mode: 0o644 },
      "zipped/run.sh": { content: "#!/bin/sh\n", mode: 0o755 },
    });
    const skill = await install.api.fromPath(zip);
    expect(skill).toMatchObject({ name: "zipped", sourceType: "local", sourceRef: zip });
    if (process.platform !== "win32") {
      expect(statSync(join(skill.libraryPath, "run.sh")).mode & 0o111).not.toBe(0);
      expect(statSync(join(skill.libraryPath, "SKILL.md")).mode & 0o111).toBe(0);
    }
    expect(readdirSync(join(world.root, "tmp"))).toEqual([]);
  });

  it("rejects an archive holding several skills", async () => {
    const zip = writeZip(join(sources, "many.zip"), {
      "one/SKILL.md": SKILL_MD,
      "two/skill.md": SKILL_MD,
    });
    await expect(install.api.fromPath(zip)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "Multiple skill directories found in archive",
    });
    expect(readdirSync(join(world.root, "tmp"))).toEqual([]);
  });

  it("names an archive without a marker after the file, not after a temp folder", async () => {
    const zip = writeZip(join(sources, "My Notes.zip"), { "README.md": "# notes" });
    const skill = await install.api.fromPath(zip);
    expect(skill.name).toBe("My Notes");
    expect(skill.dirName).toBe("My Notes");
  });

  it("rejects other file types and unreadable archives", async () => {
    writeFile(join(sources, "skill.tar.gz"), "x");
    writeFile(join(sources, "broken.zip"), "not a zip");
    await expect(install.api.fromPath(join(sources, "skill.tar.gz"))).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "Unsupported archive format: .gz",
    });
    await expect(install.api.fromPath(join(sources, "broken.zip"))).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  });
});

describe("batch import of a folder", () => {
  it("imports direct children that are skills and skips names the library already has", async () => {
    await install.api.fromPath(makeSkill(join(sources, "old"), "alpha"));
    const folder = join(sources, "batch");
    makeSkill(folder, "alpha", { body: "a different alpha" });
    makeSkill(folder, "beta");
    makeSkill(folder, "gamma-dir", { name: "gamma" });
    makeSkill(join(folder, "nested"), "deep");
    writeFile(join(folder, "loose.md"), "not a skill");

    const result = await install.api.importFolder(folder);

    expect(result).toEqual({ imported: 2, skipped: 1, errors: [] });
    expect(world.store.list().map((s) => s.name)).toEqual(["alpha", "beta", "gamma"]);
    expect(world.store.resolve("beta")).toMatchObject({
      sourceType: "local",
      sourceRef: join(folder, "beta"),
    });
    const progress = install.events.flatMap(({ event, payload }) =>
      event === "install:progress" && "key" in payload && payload.key === folder ? [payload] : [],
    );
    expect(progress.map((p) => [p.phase, p.current, p.total, p.name])).toEqual([
      ["installing", 1, 3, "alpha"],
      ["installing", 2, 3, "beta"],
      ["installing", 3, 3, "gamma"],
      ["done", undefined, undefined, undefined],
    ]);
  });
});

describe("finding skills in a repository", () => {
  let repo: string;
  beforeEach(() => {
    repo = join(world.root, "repo");
    makeSkill(join(repo, "skills"), "pdf", { files: { "examples/inner/SKILL.md": "# nested" } });
    makeSkill(join(repo, "skills", "group"), "docx");
    makeSkill(join(repo, "node_modules", "pkg"), "vendored");
    makeSkill(join(repo, ".hub"), "hidden");
    makeSkill(join(repo, "extras", "deep"), "renamed-dir", { name: "by-frontmatter" });
    symlinkSync(join(repo, "skills"), join(repo, "skills", "group", "loop"));
  });

  it("treats a skill folder as a leaf and skips vendored folders and cycles", () => {
    const found = listRepoSkills(repo);
    expect(found.map((s) => s.relPath)).toEqual([
      "extras/deep/renamed-dir",
      "skills/group/docx",
      "skills/pdf",
    ]);
    expect(found[0]).toMatchObject({ name: "by-frontmatter" });
    // A root that is itself a skill lists only itself, keyed by its folder name.
    expect(listRepoSkills(join(repo, "skills", "pdf")).map((s) => s.relPath)).toEqual(["pdf"]);
  });

  it("picks the scan root: root skill, else skills/, else skill/, else the root", () => {
    expect(resolveSkillDir(repo)).toBe(join(repo, "skills"));
    const single = makeSkill(world.root, "single");
    expect(resolveSkillDir(single)).toBe(single);
    const bare = join(world.root, "bare");
    mkdirSync(join(bare, "skill"), { recursive: true });
    expect(resolveSkillDir(bare)).toBe(join(bare, "skill"));
    mkdirSync(join(world.root, "empty"));
    expect(resolveSkillDir(join(world.root, "empty"))).toBe(join(world.root, "empty"));
  });

  it("keeps a subpath inside the repository", () => {
    expect(resolveSkillDir(repo, "skills/group")).toBe(join(repo, "skills", "group"));
    expect(() => resolveSkillDir(repo, "../sources")).toThrowError(/outside the repository/);
    expect(() => resolveSkillDir(repo, "skills/missing")).toThrowError(/does not exist/);
    symlinkSync(sources, join(repo, "escape"));
    expect(() => resolveSkillDir(repo, "escape")).toThrowError(/outside the repository/);
  });

  it("locates a skill by id: known folders first, then folder name, then frontmatter name", () => {
    makeSkill(repo, "pdf", { body: "root level wins" });
    expect(resolveSkillDir(repo, undefined, "pdf")).toBe(join(repo, "pdf"));
    expect(resolveSkillDir(repo, undefined, "docx")).toBe(join(repo, "skills", "group", "docx"));
    expect(resolveSkillDir(repo, undefined, "by-frontmatter")).toBe(
      join(repo, "extras", "deep", "renamed-dir"),
    );
    // A subpath that is not a skill falls through to the search.
    expect(resolveSkillDir(repo, "skills/group", "docx")).toBe(
      join(repo, "skills", "group", "docx"),
    );
    expect(() => resolveSkillDir(repo, undefined, "nope")).toThrowError(/not found/);
    expect(() => resolveSkillDir(repo, undefined, "../sources")).toThrowError(/not found/);
  });
});

describe("cancel registry", () => {
  it("aborts what runs under a key and reports whether anything did", () => {
    const registry = new CancelRegistry();
    expect(registry.cancel("k")).toBe(false);
    const a = registry.register("k");
    const b = registry.register("k");
    const other = registry.register("other");
    expect(registry.cancel("k")).toBe(true);
    expect([a.signal.aborted, b.signal.aborted, other.signal.aborted]).toEqual([true, true, false]);
    a.done();
    b.done();
    expect(registry.cancel("k")).toBe(false);
  });
});
