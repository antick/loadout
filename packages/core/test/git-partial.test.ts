import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGitClient } from "../src/install/git-client";
import { folderPattern } from "../src/install/git-sparse";
import { type TestWorld, createTestWorld, makeSkill, writeFile } from "./helpers";
import { commitAll, git, initRepo, isolateTmpDir } from "./install-fixtures";

/** Over the clone's size limit, so it only arrives when its folder is asked for. */
const BIG_FILE = "x".repeat(300 * 1024);

let world: TestWorld;
let remote: string;
let url: string;
let restoreTmp: () => void;

beforeEach(() => {
  world = createTestWorld();
  restoreTmp = isolateTmpDir(join(world.root, "tmp"));
  remote = initRepo(join(world.root, "remote"));
  makeSkill(join(remote, "skills"), "pdf", {
    files: { "scripts/run.sh": "echo pdf v1\n", "assets/big.txt": BIG_FILE },
  });
  makeSkill(join(remote, "skills"), "docx", { files: { "reference.md": "docx\n" } });
  writeFile(join(remote, "README.md"), "big readme\n");
  commitAll(remote, "first");
  // A file:// URL goes through the real transport, where the server may filter what it sends.
  git(remote, "config", "uploadpack.allowFilter", "true");
  url = pathToFileURL(remote).href;
});

afterEach(() => {
  restoreTmp();
  world.cleanup();
});

describe("partial checkouts", () => {
  it("checks out only the skill documents, then whole folders on request", async () => {
    const client = createGitClient(world.ctx);
    const checkout = await client.checkout(url, { manifestsOnly: true });
    try {
      expect(checkout.files).not.toBeNull();
      const pdf = join(checkout.dir, "skills", "pdf");
      expect(existsSync(join(pdf, "SKILL.md"))).toBe(true);
      expect(existsSync(join(pdf, "scripts", "run.sh"))).toBe(false);
      expect(existsSync(join(checkout.dir, "README.md"))).toBe(false);
      // What is not on disk yet is still named, from the commit.
      expect(checkout.files).toContainEqual({
        path: "skills/pdf/scripts/run.sh",
        executable: false,
      });
      expect(checkout.files).toContainEqual({ path: "README.md", executable: false });

      await checkout.materialize([pdf]);
      expect(readFileSync(join(pdf, "scripts", "run.sh"), "utf8")).toBe("echo pdf v1\n");
      expect(readFileSync(join(pdf, "assets", "big.txt"), "utf8")).toBe(BIG_FILE);
      // Only what was asked for.
      expect(existsSync(join(checkout.dir, "skills", "docx", "reference.md"))).toBe(false);
      expect(existsSync(join(checkout.dir, "README.md"))).toBe(false);
      await expect(checkout.materialize([world.root])).rejects.toMatchObject({
        code: "INVALID_INPUT",
      });
    } finally {
      await checkout.cleanup();
    }
  });

  it("fills folders from the commit it was listed at, even after the cache moved on", async () => {
    const client = createGitClient(world.ctx);
    const first = await client.checkout(url, { manifestsOnly: true });
    try {
      writeFile(join(remote, "skills", "pdf", "scripts", "run.sh"), "echo pdf v2\n");
      commitAll(remote, "second");
      const newer = await client.checkout(url);
      expect(readFileSync(join(newer.dir, "skills", "pdf", "scripts", "run.sh"), "utf8")).toBe(
        "echo pdf v2\n",
      );
      await newer.cleanup();

      const pdf = join(first.dir, "skills", "pdf");
      await first.materialize([pdf]);
      expect(readFileSync(join(pdf, "scripts", "run.sh"), "utf8")).toBe("echo pdf v1\n");
    } finally {
      await first.cleanup();
    }
  });

  it("keeps the slot of an open partial checkout, and clones again when it is gone", async () => {
    const client = createGitClient(world.ctx);
    const reposDir = join(world.ctx.paths.cacheDir, "repos");
    const preview = await client.checkout(url, { manifestsOnly: true });
    try {
      // Clearing the cache leaves the slot the preview still needs.
      expect(await client.clearCache()).toBe(0);
      expect(readdirSync(reposDir).some((name) => !name.endsWith(".lock"))).toBe(true);

      const pdf = join(preview.dir, "skills", "pdf");
      await preview.materialize([pdf]);
      expect(readFileSync(join(pdf, "scripts", "run.sh"), "utf8")).toBe("echo pdf v1\n");

      // The slot deleted by hand: the next folder is cloned afresh at the same commit.
      rmSync(reposDir, { recursive: true, force: true });
      const docx = join(preview.dir, "skills", "docx");
      await preview.materialize([docx]);
      expect(readFileSync(join(docx, "reference.md"), "utf8")).toBe("docx\n");
    } finally {
      await preview.cleanup();
    }
    // Cleaned up, the slot can go.
    expect(await client.clearCache()).toBeGreaterThan(0);
  });

  it("gives every file for a skill at the repository root, and to a whole checkout", async () => {
    const client = createGitClient(world.ctx);
    const partial = await client.checkout(url, { manifestsOnly: true });
    await partial.materialize([partial.dir]);
    expect(existsSync(join(partial.dir, "README.md"))).toBe(true);
    expect(existsSync(join(partial.dir, "skills", "docx", "reference.md"))).toBe(true);
    await partial.cleanup();

    const whole = await client.checkout(url);
    expect(whole.files).toBeNull();
    expect(existsSync(join(whole.dir, "README.md"))).toBe(true);
    await whole.materialize([join(whole.dir, "skills")]);
    await whole.cleanup();
  });

  it("reads the id of every folder and file asked for, at every commit, from fetched trees", async () => {
    const first = git(remote, "rev-parse", "HEAD");
    writeFile(join(remote, "skills", "pdf", "scripts", "run.sh"), "echo pdf v2\n");
    writeFile(join(remote, "odd name", "SKILL.md"), "spaces in the path\n");
    const second = commitAll(remote, "second");
    const client = createGitClient(world.ctx);
    const paths = ["skills/pdf", "/skills/docx/", "README.md", "missing", "", "odd name", "a\nb"];
    const trees = await client.folderTrees(url, [first, second, "not-a-commit"], paths);
    const expected = (revision: string): (string | null)[] =>
      paths.map((path) => {
        const clean = path.replace(/^\/+|\/+$/g, "");
        if (path === "missing" || path.includes("\n")) return null;
        if (path === "odd name" && revision === first) return null;
        return git(remote, "rev-parse", `${revision}:${clean}`);
      });
    expect([...trees.keys()]).toEqual([first, second]);
    expect(trees.get(first)).toEqual(expected(first));
    expect(trees.get(second)).toEqual(expected(second));
    expect(trees.get(first)?.[0]).not.toBe(trees.get(second)?.[0]);
    expect(trees.get(first)?.[1]).toBe(trees.get(second)?.[1]);
  });

  it("anchors folder patterns and escapes glob characters", () => {
    expect(folderPattern("skills/pdf")).toBe("/skills/pdf/");
    expect(folderPattern("a\\b")).toBe("/a/b/");
    expect(folderPattern("odd[1]*?")).toBe("/odd\\[1\\]\\*\\?/");
  });
});
