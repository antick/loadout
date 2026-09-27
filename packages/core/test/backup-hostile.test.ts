import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isPlainEntryName } from "../src/backup/merge-read";
import { type Device, createBareRemote, createDevice, isolateGit, rawGit } from "./backup-world";
import { tempDir } from "./helpers";

describe("a hostile backup remote", () => {
  let temp: ReturnType<typeof tempDir>;
  let device: Device | null = null;
  beforeEach(() => {
    temp = tempDir();
    isolateGit(temp.dir);
  });
  afterEach(() => {
    device?.close();
    temp.cleanup();
  });

  it("names nothing outside the library or inside .git", () => {
    for (const name of [".", "..", ".git", ".GIT", ".git.", ".git ", "a/b", "a\\b", ""]) {
      expect(isPlainEntryName(name)).toBe(false);
    }
    for (const name of ["alpha", ".loadout", ".gitignore", "..hidden", "git"]) {
      expect(isPlainEntryName(name)).toBe(true);
    }
  });

  it("cannot make a pull delete the library through a `..` or `.git` entry", async () => {
    const remote = createBareRemote(temp.dir);
    const a = createDevice(temp.dir, "A");
    device = a;
    a.addSkill("alpha");
    await a.api.init();
    await a.api.setRemote(remote);
    await a.api.sync();

    // A commit on the remote whose tree names `..` and `.git` at the top.
    const blob = execFileSync("git", ["hash-object", "-w", "--stdin"], {
      cwd: remote,
      input: "evil",
      encoding: "utf8",
    }).trim();
    const head = rawGit(remote, "rev-parse", "main");
    const tree = rawGit(remote, "rev-parse", `${head}^{tree}`);
    const listing = rawGit(remote, "ls-tree", tree);
    for (const name of ["..", ".git"]) {
      const hostile = execTree(remote, `${listing}\n100644 blob ${blob}\t${name}\n`);
      const commit = rawGit(remote, "commit-tree", hostile, "-p", head, "-m", "evil");
      rawGit(remote, "update-ref", "refs/heads/main", commit);
      await a.api.pull().catch(() => undefined);
      expect(existsSync(a.ctx.paths.dbPath)).toBe(true);
      expect(existsSync(join(a.ctx.paths.skillsDir, ".git"))).toBe(true);
      expect(existsSync(join(a.ctx.paths.skillsDir, "alpha", "SKILL.md"))).toBe(true);
    }
  });
});

function execTree(cwd: string, input: string): string {
  return execFileSync("git", ["mktree"], { cwd, input, encoding: "utf8" }).trim();
}
