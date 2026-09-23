import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import type { Deployment, Skill } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashDir } from "../src/util/hash";
import {
  classifySync,
  describeLocalSkill,
  findLocalSkillDirs,
  indexLibrary,
  matchLibrarySkill,
  scanSkillRoot,
  walkSkillRoot,
} from "../src/workspace";
import { makeSkill, tempDir, writeFile } from "./helpers";
import { setContentMtime } from "./workspace-world";

const T0 = Date.UTC(2026, 0, 1);

let temp: ReturnType<typeof tempDir>;
let library: string;
let root: string;

beforeEach(() => {
  temp = tempDir();
  library = join(temp.dir, "library");
  root = join(temp.dir, "agent", "skills");
  mkdirSync(root, { recursive: true });
});
afterEach(() => temp.cleanup());

/** A library skill row for a folder made with `makeSkill`. */
function librarySkill(dirName: string, overrides: Partial<Skill> = {}): Skill {
  const libraryPath = makeSkill(library, dirName, { body: `library ${dirName}` });
  return {
    id: `id-${dirName}`,
    name: dirName,
    dirName,
    description: null,
    sourceType: "local",
    sourceRef: null,
    sourceUrl: null,
    sourceSubpath: null,
    sourceBranch: null,
    sourceRevision: null,
    remoteRevision: null,
    updateStatus: "local_only",
    lastCheckedAt: null,
    lastCheckError: null,
    libraryPath,
    contentHash: hashDir(libraryPath),
    createdAt: T0,
    updatedAt: T0,
    deployments: [],
    presetIds: [],
    tags: [],
    hasConflict: false,
    editedFiles: [],
    issues: [],
    ...overrides,
  };
}

const entryAt = (path: string) => describeLocalSkill({ path, relativePath: "x" });

/** A local folder holding byte for byte what `librarySkill("alpha")` holds. */
const alphaCopy = (dirName: string): string =>
  makeSkill(root, dirName, {
    name: "alpha",
    description: "Test skill alpha",
    body: "library alpha",
  });

describe("scanSkillRoot", () => {
  it("lists direct children only when flat, with name, files, hash and mtime", () => {
    makeSkill(root, "beta", { name: "Beta Skill", files: { "notes/a.txt": "a" } });
    makeSkill(root, "alpha");
    makeSkill(join(root, "group"), "nested");
    writeFile(join(root, "loose.txt"), "not a skill");

    const entries = scanSkillRoot(root, { recursive: false });
    expect(entries.map((e) => e.relativePath)).toEqual(["alpha", "beta"]);
    const beta = entries[1];
    expect(beta).toMatchObject({
      name: "Beta Skill",
      dirName: "beta",
      description: "Test skill beta",
      path: join(root, "beta"),
      files: ["notes/", "SKILL.md"],
    });
    expect(beta?.hash).toBe(hashDir(join(root, "beta")));
    expect(beta?.newestMtime).toBeGreaterThan(0);
  });

  it("descends through namespace folders and treats a skill folder as a leaf", () => {
    makeSkill(join(root, "research"), "web-search");
    makeSkill(join(root, "research", "deep"), "papers");
    makeSkill(root, "top");
    // A skill bundled inside another skill is part of that skill, not one of its own.
    makeSkill(join(root, "top", "examples"), "inner");

    const found = findLocalSkillDirs(root, { recursive: true }).map((d) => d.relativePath);
    expect(found).toEqual(["research/deep/papers", "research/web-search", "top"]);
  });

  it("skips hidden folders and embedded bundles that carry their own skills folder", () => {
    makeSkill(join(root, ".hidden"), "secret");
    makeSkill(root, ".staged-copy");
    makeSkill(join(root, "plugin", "skills"), "bundled");
    makeSkill(join(root, "namespace"), "fine");

    const found = findLocalSkillDirs(root, { recursive: true }).map((d) => d.relativePath);
    expect(found).toEqual(["namespace/fine"]);
  });

  it("survives a link that points back up the tree", () => {
    makeSkill(join(root, "group"), "one");
    symlinkSync(root, join(root, "group", "loop"), "dir");
    const found = findLocalSkillDirs(root, { recursive: true }).map((d) => d.relativePath);
    expect(found).toEqual(["group/one"]);
  });

  it("returns nothing for a missing root", () => {
    expect(scanSkillRoot(join(temp.dir, "nope"), { recursive: true })).toEqual([]);
  });
});

describe("matchLibrarySkill", () => {
  it("strict: matches the recorded source path, literally or through a link", () => {
    const local = makeSkill(root, "mine", { body: "edited since" });
    const alias = join(temp.dir, "alias");
    symlinkSync(join(temp.dir, "agent"), alias, "dir");
    const skill = librarySkill("mine", { sourceRef: join(alias, "skills", "mine") });
    const index = indexLibrary([skill], []);
    expect(matchLibrarySkill(entryAt(local), index, "strict")?.id).toBe(skill.id);
  });

  it("strict: a deployment row pointing at the folder wins over a source path", () => {
    const local = makeSkill(root, "shared", { body: "whatever is there now" });
    const imported = librarySkill("imported", { sourceRef: local });
    const deployed = librarySkill("deployed");
    const row: Deployment = {
      id: "d1",
      skillId: deployed.id,
      agentKey: "cursor",
      targetPath: local,
      mode: "copy",
      syncedAt: T0,
    };
    const index = indexLibrary([imported, deployed], [row]);
    expect(matchLibrarySkill(entryAt(local), index, "strict")?.id).toBe(deployed.id);
  });

  it("strict: falls back to equal content and never to the name", () => {
    const skill = librarySkill("alpha");
    const index = indexLibrary([skill], []);
    const sameContent = alphaCopy("renamed");
    const sameName = makeSkill(root, "alpha", { body: "different content" });
    expect(matchLibrarySkill(entryAt(sameContent), index, "strict")?.id).toBe(skill.id);
    expect(matchLibrarySkill(entryAt(sameName), index, "strict")).toBeNull();
  });

  it("matches a folder that is a link into the library", () => {
    const skill = librarySkill("alpha", { contentHash: null });
    const link = join(root, "alpha-link");
    symlinkSync(skill.libraryPath, link, "dir");
    expect(matchLibrarySkill(entryAt(link), indexLibrary([skill], []), "strict")?.id).toBe(
      skill.id,
    );
  });

  it("loose: content must name exactly one skill, then the folder name decides", () => {
    const first = librarySkill("alpha");
    const twin = { ...librarySkill("alpha-copy"), contentHash: first.contentHash };
    const index = indexLibrary([first, twin], []);
    // The same content sits in two library skills; only the folder name tells them apart.
    const local = alphaCopy("ALPHA-COPY");
    expect(entryAt(local).hash).toBe(first.contentHash);
    expect(matchLibrarySkill(entryAt(local), index, "loose")?.id).toBe(twin.id);
    const stranger = alphaCopy("elsewhere");
    expect(matchLibrarySkill(entryAt(stranger), index, "loose")).toBeNull();
  });

  it("loose: matches edited content by library folder name, then by the name's slug", () => {
    const byDir = librarySkill("code-review");
    const bySlug = librarySkill("pdf-2", { name: "PDF Kit" });
    const index = indexLibrary([byDir, bySlug], []);
    const edited = makeSkill(root, "Code-Review", { body: "edited" });
    const slugged = makeSkill(root, "pdf-kit", { body: "edited too" });
    const unknown = makeSkill(root, "unknown", { body: "new" });
    expect(matchLibrarySkill(entryAt(edited), index, "loose")?.id).toBe(byDir.id);
    expect(matchLibrarySkill(entryAt(slugged), index, "loose")?.id).toBe(bySlug.id);
    expect(matchLibrarySkill(entryAt(unknown), index, "loose")).toBeNull();
    expect(matchLibrarySkill(entryAt(edited), index, "strict")).toBeNull();
  });

  it("loose: several skills with one slug need the content to break the tie", () => {
    const a = librarySkill("kit-a", { name: "My Kit" });
    const b = librarySkill("kit-b", { name: "my kit" });
    const index = indexLibrary([a, b], []);
    const edited = makeSkill(root, "my-kit", { body: "edited" });
    expect(matchLibrarySkill(entryAt(edited), index, "loose")).toBeNull();
  });
});

describe("classifySync", () => {
  it("is local_only without a library skill", () => {
    expect(classifySync(entryAt(makeSkill(root, "solo")), null)).toBe("local_only");
  });

  it("is in_sync on the stored hash, or on a fresh hash when the stored one is stale", () => {
    const skill = librarySkill("alpha");
    const local = alphaCopy("alpha");
    setContentMtime(local, T0 + 60_000);
    setContentMtime(skill.libraryPath, T0);
    expect(classifySync(entryAt(local), skill)).toBe("in_sync");
    expect(classifySync(entryAt(local), { ...skill, contentHash: "stale" })).toBe("in_sync");
  });

  it("compares the newest content file on each side with a one second threshold", () => {
    const skill = librarySkill("alpha");
    const local = makeSkill(root, "alpha", { body: "edited", files: { "extra.txt": "x" } });
    setContentMtime(skill.libraryPath, T0);

    setContentMtime(local, T0 + 1001);
    expect(classifySync(entryAt(local), skill)).toBe("local_newer");
    setContentMtime(local, T0 - 1001);
    expect(classifySync(entryAt(local), skill)).toBe("library_newer");
    setContentMtime(local, T0 + 1000);
    expect(classifySync(entryAt(local), skill)).toBe("diverged");
    setContentMtime(local, T0 - 1000);
    expect(classifySync(entryAt(local), skill)).toBe("diverged");
  });

  it("is diverged when a side has no content to date", () => {
    const skill = librarySkill("alpha");
    const local = makeSkill(root, "alpha", { body: "edited" });
    expect(classifySync({ hash: "x", newestMtime: null }, skill)).toBe("diverged");
    const gone = { ...skill, libraryPath: join(library, "missing") };
    expect(classifySync(entryAt(local), gone)).toBe("diverged");
  });
});

describe("walkSkillRoot", () => {
  const brokenOf = (recursive: boolean) =>
    walkSkillRoot(root, { recursive }).broken.map((b) => [b.relativePath, b.reason]);

  it("flat: every visible folder without a SKILL.md is broken, bundles and files are not", () => {
    makeSkill(root, "good");
    mkdirSync(join(root, "empty"));
    writeFile(join(root, "notes", "README.md"), "not a skill");
    // An agent reading direct children never sees a skill one level down.
    makeSkill(join(root, "group"), "nested");
    makeSkill(join(root, "plugin", "skills"), "bundled");
    mkdirSync(join(root, ".cache"));
    writeFile(join(root, "loose.txt"), "a file");

    const scan = walkSkillRoot(root, { recursive: false });
    expect(scan.skills.map((d) => d.relativePath)).toEqual(["good"]);
    expect(brokenOf(false)).toEqual([
      ["empty", "missing_document"],
      ["group", "missing_document"],
      ["notes", "missing_document"],
    ]);
    expect(scan.broken[0]).toMatchObject({ path: join(root, "empty"), linkTarget: null });
  });

  it("recursive: a namespace is broken only when nothing at all is found below it", () => {
    makeSkill(join(root, "research"), "web-search");
    mkdirSync(join(root, "research", "drafts"));
    mkdirSync(join(root, "hollow", "a", "b"), { recursive: true });
    mkdirSync(join(root, "only-link"));
    symlinkSync(join(temp.dir, "gone"), join(root, "only-link", "dead"), "dir");

    expect(brokenOf(true)).toEqual([
      ["hollow", "missing_document"],
      ["only-link/dead", "dangling_link"],
      ["research/drafts", "missing_document"],
    ]);
  });

  it("reports a link to nothing, and a link to a folder without a SKILL.md, with its target", () => {
    const gone = join(temp.dir, "deleted-checkout", "skill");
    symlinkSync(gone, join(root, "dead"), "dir");
    const plain = join(temp.dir, "plain-folder");
    mkdirSync(plain);
    symlinkSync(plain, join(root, "not-a-skill"), "dir");
    const file = join(temp.dir, "file.md");
    writeFile(file, "text");
    symlinkSync(file, join(root, "to-a-file"));

    expect(walkSkillRoot(root, { recursive: false }).broken).toEqual([
      { path: join(root, "dead"), relativePath: "dead", reason: "dangling_link", linkTarget: gone },
      {
        path: join(root, "not-a-skill"),
        relativePath: "not-a-skill",
        reason: "missing_document",
        linkTarget: plain,
      },
    ]);
  });

  it("does not call a folder broken because a link inside it loops back up", () => {
    mkdirSync(join(root, "group"));
    symlinkSync(root, join(root, "group", "loop"), "dir");
    expect(brokenOf(true)).toEqual([]);
  });

  it("returns nothing for a missing root", () => {
    expect(walkSkillRoot(join(temp.dir, "nope"), { recursive: true })).toEqual({
      skills: [],
      broken: [],
    });
  });
});
