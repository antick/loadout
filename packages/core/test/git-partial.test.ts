import { existsSync, readFileSync } from "node:fs";
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
      expect(checkout.partial).toBe(true);
      const pdf = join(checkout.dir, "skills", "pdf");
      expect(existsSync(join(pdf, "SKILL.md"))).toBe(true);
      expect(existsSync(join(pdf, "scripts", "run.sh"))).toBe(false);
      expect(existsSync(join(checkout.dir, "README.md"))).toBe(false);

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

  it("gives every file for a skill at the repository root, and to a whole checkout", async () => {
    const client = createGitClient(world.ctx);
    const partial = await client.checkout(url, { manifestsOnly: true });
    await partial.materialize([partial.dir]);
    expect(existsSync(join(partial.dir, "README.md"))).toBe(true);
    expect(existsSync(join(partial.dir, "skills", "docx", "reference.md"))).toBe(true);
    await partial.cleanup();

    const whole = await client.checkout(url);
    expect(whole.partial).toBe(false);
    expect(existsSync(join(whole.dir, "README.md"))).toBe(true);
    await whole.materialize([join(whole.dir, "skills")]);
    await whole.cleanup();
  });

  it("anchors folder patterns and escapes glob characters", () => {
    expect(folderPattern("skills/pdf")).toBe("/skills/pdf/");
    expect(folderPattern("a\\b")).toBe("/a/b/");
    expect(folderPattern("odd[1]*?")).toBe("/odd\\[1\\]\\*\\?/");
  });
});
