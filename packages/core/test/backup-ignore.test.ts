import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { type Device, pushByHand, rawGit, useTwoDevices } from "./backup-world";
import { DEFAULT_IGNORE_LINES } from "../src/backup/size";
import { rejection, writeFile } from "./helpers";

const ignoreFile = (device: Device): string =>
  readFileSync(join(device.skillsDir, ".gitignore"), "utf8");
const tracked = (device: Device): string[] => device.git("ls-files").split("\n");

/** Leave local-only files out of the backup, and keep them through merges. */
describe("backup ignore rules", () => {
  const world = useTwoDevices(["alpha", "beta"]);
  let a: Device;
  let b: Device;

  beforeEach(() => {
    ({ a, b } = world);
  });

  it("leaves dependencies, local secrets and logs out by default", async () => {
    const rules = await a.api.ignoreRules();
    expect(rules.defaults).toEqual(
      expect.arrayContaining(["node_modules/", ".venv/", ".env", "*.log", ".DS_Store"]),
    );
    expect(rules.custom).toEqual([]);

    writeFile(join(a.skillsDir, "alpha", "node_modules", "dep", "index.js"), "dep");
    writeFile(join(a.skillsDir, "alpha", ".env"), "KEY=1");
    writeFile(join(a.skillsDir, "alpha", "run.log"), "log");
    a.editSkill("alpha", "edited");
    await a.api.sync();

    const files = tracked(a);
    expect(files).toContain("alpha/notes.md");
    expect(files.filter((file) => /node_modules|\.env|\.log$/.test(file))).toEqual([]);
  });

  it("gives a library set up by an older version the lines added since, keeping its own last", async () => {
    // What a library backed up before `.env.*` and `venv/` joined the list holds.
    const older = [".DS_Store", "node_modules/", ".venv/", ".env", "*.log", "", "outputs/", ""];
    writeFile(join(a.skillsDir, ".gitignore"), older.join("\n"));
    writeFile(join(a.skillsDir, "alpha", ".env.local"), "KEY=1");
    writeFile(join(a.skillsDir, "alpha", ".env.example"), "KEY=");
    writeFile(join(a.skillsDir, "alpha", "venv", "bin", "python"), "x");
    a.editSkill("alpha", "edited");
    await a.api.sync();

    const lines = ignoreFile(a).split("\n");
    expect(lines.slice(0, DEFAULT_IGNORE_LINES.length)).toEqual([...DEFAULT_IGNORE_LINES]);
    expect(lines.filter((line) => line === ".env")).toHaveLength(1);
    expect((await a.api.ignoreRules()).custom).toEqual(["outputs/"]);
    const files = tracked(a);
    expect(files).toContain("alpha/.env.example");
    expect(files).not.toContain("alpha/.env.local");
    expect(files.filter((file) => file.includes("venv/"))).toEqual([]);
  });

  it("saves the user's own patterns, keeps them apart from the defaults, and shares them", async () => {
    const saved = await a.api.setIgnoreRules(["", "outputs/", "  ", "!keep.log", ""]);
    expect(saved.custom).toEqual(["outputs/", "", "!keep.log"]);
    expect(ignoreFile(a)).toContain("outputs/\n\n!keep.log\n");

    writeFile(join(a.skillsDir, "alpha", "outputs", "big.bin"), "x");
    writeFile(join(a.skillsDir, "alpha", "keep.log"), "kept");
    a.editSkill("alpha", "edited");
    await a.api.sync();
    const files = tracked(a);
    expect(files).toContain("alpha/keep.log");
    expect(files).not.toContain("alpha/outputs/big.bin");

    await b.api.sync();
    expect((await b.api.ignoreRules()).custom).toEqual(["outputs/", "", "!keep.log"]);
  });

  it.each(["*", "*.md", "SKILL.md", "*/", ".loadout/", "**/*.json", ".gitignore"])(
    "refuses %s, which would leave whole skills or the app's files out",
    async (pattern) => {
      const before = ignoreFile(a);
      await expect(a.api.setIgnoreRules(["outputs/", pattern])).rejects.toMatchObject({
        code: "INVALID_INPUT",
      });
      expect(ignoreFile(a)).toBe(before);
      expect((await a.api.ignoreRules()).custom).toEqual([]);
    },
  );

  it("refuses too many or too long patterns", async () => {
    await expect(a.api.setIgnoreRules(["x".repeat(301)])).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    const many = Array.from({ length: 201 }, (_, index) => `dir-${index}/`);
    await expect(a.api.setIgnoreRules(many)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("keeps left-out files when another device's edit replaces the skill", async () => {
    writeFile(join(b.skillsDir, "alpha", "node_modules", "dep", "index.js"), "dep");
    writeFile(join(b.skillsDir, "alpha", ".env"), "SECRET=1");
    await b.api.sync();

    a.editSkill("alpha", "from A");
    writeFile(join(a.skillsDir, "alpha", "added.md"), "new file");
    await a.api.sync();
    b.editSkill("beta", "from B");
    await b.api.sync();

    expect(b.read("alpha")).toBe("from A");
    expect(b.read("alpha", "added.md")).toBe("new file");
    expect(b.read("alpha", ".env")).toBe("SECRET=1");
    expect(b.read("alpha", "node_modules/dep/index.js")).toBe("dep");
  });

  it("keeps left-out files on a fast-forward too", async () => {
    writeFile(join(b.skillsDir, "alpha", ".env"), "SECRET=1");
    a.editSkill("alpha", "from A");
    await a.api.sync();
    const outcome = await b.api.sync();

    // Fast-forwarded: no merge commit, the same commit as the other device.
    expect(outcome.merge?.upToDate).toBe(false);
    expect(b.git("rev-parse", "HEAD")).toBe(a.git("rev-parse", "HEAD"));
    expect(b.read("alpha")).toBe("from A");
    expect(b.read("alpha", ".env")).toBe("SECRET=1");
  });

  it("moves left-out files along when another device renames the skill", async () => {
    writeFile(join(b.skillsDir, "alpha", ".env"), "SECRET=1");
    a.renameSkill("alpha", "alpha-renamed");
    await a.api.sync();
    await b.api.sync();

    expect(existsSync(join(b.skillsDir, "alpha"))).toBe(false);
    expect(b.read("alpha-renamed", ".env")).toBe("SECRET=1");
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "keeps left-out files of a renamed skill when the merge fails before its commit",
    async () => {
      writeFile(join(b.skillsDir, "alpha", ".env"), "SECRET=1");
      a.renameSkill("alpha", "alpha-renamed");
      await a.api.sync();
      // Writing the moved skill's metadata fails once its folder has been moved.
      const metadata = join(b.ctx.paths.metadataDir, "skills");
      chmodSync(metadata, 0o555);
      try {
        await expect(b.api.sync()).rejects.toThrow();
      } finally {
        chmodSync(metadata, 0o755);
      }
      expect(b.read("alpha", ".env")).toBe("SECRET=1");

      await b.api.sync();
      expect(b.read("alpha-renamed", ".env")).toBe("SECRET=1");
    },
  );

  it("leaves no folder of left-out files behind when another device deletes the skill", async () => {
    writeFile(join(b.skillsDir, "alpha", "node_modules", "dep", "index.js"), "dep");
    a.deleteSkill("alpha");
    await a.api.sync();
    await b.api.sync();

    expect(existsSync(join(b.skillsDir, "alpha"))).toBe(false);
    expect(b.skill("alpha")).toBeNull();
  });

  it("keeps left-out files when a conflict is settled with the remote version", async () => {
    writeFile(join(b.skillsDir, "alpha", ".env"), "SECRET=1");
    a.editSkill("alpha", "A's version");
    await a.api.sync();
    b.editSkill("alpha", "B's version");
    await b.api.sync();
    const conflict = (await b.api.conflicts())[0];
    expect(conflict).toBeDefined();

    await b.api.resolveConflicts([conflict?.skillKey ?? ""], "use_remote");
    expect(b.read("alpha")).toBe("A's version");
    expect(b.read("alpha", ".env")).toBe("SECRET=1");
  });

  /** Device A tracks a file at the path of B's left-out `.env` in alpha (added past the rules). */
  async function trackEnvOnA(): Promise<void> {
    writeFile(join(a.skillsDir, "alpha", ".env"), "FROM_A=1");
    a.git("add", "-f", "alpha/.env");
    a.editSkill("alpha", "from A");
    await a.api.sync();
  }

  /** B's own `.env`, kept in Recently removed with the folder it lived in. */
  function keptEnv(): string[] {
    return keptFiles(".env");
  }

  it("keeps a left-out file in Recently removed when the other device's version has a file at its path", async () => {
    await trackEnvOnA();
    writeFile(join(b.skillsDir, "alpha", ".env"), "SECRET=1");
    b.editSkill("beta", "from B");
    await b.api.sync();

    expect(b.read("alpha")).toBe("from A");
    expect(b.read("alpha", ".env")).toBe("FROM_A=1");
    expect(keptEnv()).toEqual(["SECRET=1"]);
  });

  it("does not fast-forward over a left-out file the other device's version has a file at", async () => {
    await trackEnvOnA();
    writeFile(join(b.skillsDir, "alpha", ".env"), "SECRET=1");
    const outcome = await b.api.sync();

    // A real merge commit with both parents.
    expect(outcome.merge?.upToDate).toBe(false);
    expect(b.git("log", "-1", "--format=%P").split(" ")).toHaveLength(2);
    expect(b.read("alpha")).toBe("from A");
    expect(keptEnv()).toEqual(["SECRET=1"]);
  });

  it("keeps a colliding left-out file when a conflict is settled with the remote version", async () => {
    await trackEnvOnA();
    writeFile(join(b.skillsDir, "alpha", ".env"), "SECRET=1");
    b.editSkill("alpha", "B's version");
    await b.api.sync();
    const conflict = (await b.api.conflicts())[0];
    expect(conflict).toBeDefined();

    await b.api.resolveConflicts([conflict?.skillKey ?? ""], "use_remote");
    expect(b.read("alpha", ".env")).toBe("FROM_A=1");
    expect(keptEnv()).toEqual(["SECRET=1"]);
  });

  it("journals a conflict choice, so what a crash leaves is kept at the next sync", async () => {
    await trackEnvOnA();
    writeFile(join(b.skillsDir, "alpha", ".env"), "SECRET=1");
    b.editSkill("alpha", "B's version");
    await b.api.sync();
    const conflict = (await b.api.conflicts())[0];
    const note = join(b.skillsDir, ".git", "loadout-merging");
    // Called once the choice is committed: the moment a crash would leave the journal behind.
    const setAside = b.removed.setAside.bind(b.removed);
    let journal = "";
    b.removed.setAside = () => {
      journal = readFileSync(note, "utf8");
      throw new Error("crashed");
    };
    await rejection(b.api.resolveConflicts([conflict?.skillKey ?? ""], "use_remote"));
    expect(journal).toContain(JSON.stringify(join(b.skillsDir, "alpha")));

    // As a crash leaves it: the note of a process that is gone, our folder still set aside.
    writeFileSync(note, `${2 ** 22 + 7}\n${journal.split("\n").slice(1).join("\n")}`);
    b.removed.setAside = setAside;
    await b.api.sync();
    expect(keptEnv()).toEqual(["SECRET=1"]);
    expect(existsSync(note)).toBe(false);
    const stages = readdirSync(dirname(b.skillsDir)).filter((name) =>
      name.startsWith(".backup-stage-"),
    );
    expect(stages).toEqual([]);
  });

  it("undoes a conflict choice that a crash cut off before its commit", async () => {
    b.editSkill("alpha", "B's version");
    b.git("add", "-A");
    b.git("commit", "--quiet", "-m", "backup: before resolving");
    // As a conflict choice leaves it: its safety point journaled shortened, our folder moved
    // into the scratch folder, nothing committed yet.
    const safety = b.git("rev-parse", "--short=12", "HEAD");
    const stage = join(dirname(b.skillsDir), ".backup-stage-crashed");
    const from = join(b.skillsDir, "alpha");
    const to = join(stage, "alpha");
    mkdirSync(stage, { recursive: true });
    renameSync(from, to);
    const note = join(b.skillsDir, ".git", "loadout-merging");
    const entries = [
      { head: safety, stage },
      { from, to },
    ].map((entry) => JSON.stringify(entry));
    writeFileSync(note, [`${2 ** 22 + 7}`, ...entries, ""].join("\n"));

    await b.api.sync();
    expect(b.read("alpha")).toBe("B's version");
    expect(b.removed.list()).toEqual([]);
    expect(existsSync(note)).toBe(false);
    expect(existsSync(stage)).toBe(false);
  });

  /** What Recently removed on B holds at `relative` inside each kept folder. */
  function keptFiles(relative: string): string[] {
    return b.removed
      .list()
      .map((entry) => join(b.removed.contentPath(entry.id), relative))
      .filter((path) => existsSync(path))
      .map((path) => readFileSync(path, "utf8"));
  }

  it("keeps a left-out folder whose file the other device tracks, both versions whole", async () => {
    await a.api.setIgnoreRules(["outputs/"]);
    await a.api.sync();
    await b.api.sync();
    writeFile(join(b.skillsDir, "alpha", "outputs", "result.txt"), "unique local output");
    writeFile(join(a.skillsDir, "alpha", "outputs", "result.txt"), "remote output");
    a.git("add", "-f", "alpha/outputs/result.txt");
    a.editSkill("alpha", "from A");
    await a.api.sync();
    b.editSkill("beta", "from B");
    await b.api.sync();

    expect(b.read("alpha", "outputs/result.txt")).toBe("remote output");
    expect(keptFiles("outputs/result.txt")).toEqual(["unique local output"]);
  });

  it("keeps a left-out file in Recently removed when moving it across fails", async () => {
    await a.api.setIgnoreRules(["cache.txt"]);
    await a.api.sync();
    await b.api.sync();
    writeFile(join(b.skillsDir, "alpha", "data", "cache.txt"), "local cache");
    // A file where B keeps a folder: the left-out file cannot go back in.
    writeFile(join(a.skillsDir, "alpha", "data"), "a file now");
    a.editSkill("alpha", "from A");
    await a.api.sync();
    b.editSkill("beta", "from B");
    await b.api.sync();

    expect(b.read("alpha", "data")).toBe("a file now");
    expect(keptFiles("data/cache.txt")).toEqual(["local cache"]);
  });

  it("leaves the files on disk and says where when Recently removed cannot take them", async () => {
    await trackEnvOnA();
    writeFile(join(b.skillsDir, "alpha", ".env"), "SECRET=1");
    b.editSkill("beta", "from B");
    b.removed.setAside = () => {
      throw new Error("disk full");
    };

    const error = await rejection(b.api.sync());
    expect(error.code).toBe("IO");
    const dir = String((error.details as { path?: string } | undefined)?.path);
    expect(readFileSync(join(dir, ".env"), "utf8")).toBe("SECRET=1");
    expect(error.message).toContain(dir);
    // Everything else was done: the merge is in, and the next sync sends it.
    expect(b.read("alpha")).toBe("from A");
    expect(await b.api.sync()).toMatchObject({ pushed: true });
  });

  it("keeps a left-out file in Recently removed when a restore point has a file at its path", async () => {
    // Tracked past the rules in an older version, left out since.
    writeFile(join(b.skillsDir, "alpha", ".env"), "OLD=1");
    b.git("add", "-f", "alpha/.env");
    b.git("commit", "--quiet", "-m", "backup: with env");
    const point = b.git("rev-parse", "--short=12", "HEAD");
    b.git("rm", "--quiet", "--cached", "alpha/.env");
    b.git("commit", "--quiet", "-m", "backup: env left out");
    writeFile(join(b.skillsDir, "alpha", ".env"), "SECRET=1");
    writeFile(join(b.skillsDir, "alpha", "node_modules", "dep.js"), "local dependency");

    await b.api.restore(point);
    expect(b.read("alpha", ".env")).toBe("OLD=1");
    expect(keptEnv()).toEqual(["SECRET=1"]);
    // What the restore point has no file at stays put.
    expect(b.read("alpha", "node_modules/dep.js")).toBe("local dependency");
  });

  it("refuses a restore that would overwrite a left-out file at the top of the library", async () => {
    writeFile(join(b.skillsDir, ".env"), "OLD=1");
    b.git("add", "-f", ".env");
    b.git("commit", "--quiet", "-m", "backup: with env");
    const point = b.git("rev-parse", "--short=12", "HEAD");
    b.git("rm", "--quiet", "--cached", ".env");
    b.git("commit", "--quiet", "-m", "backup: env left out");
    writeFile(join(b.skillsDir, ".env"), "SECRET=1");
    const head = b.git("rev-parse", "HEAD");

    const error = await rejection(b.api.restore(point));
    expect(error.code).toBe("GIT");
    expect(error.details).toMatchObject({ paths: [".env"] });
    expect(readFileSync(join(b.skillsDir, ".env"), "utf8")).toBe("SECRET=1");
    expect(b.git("rev-parse", "HEAD")).toBe(head);
  });

  it("never lets a line merge overwrite a left-out file, and names it", async () => {
    // Someone tracks a file by hand where B keeps a left-out one; the push lacks the metadata.
    pushByHand(world.dir, world.remote, basename(a.ctx.paths.metadataDir), (dir) => {
      writeFile(join(dir, "alpha", ".env"), "BY_HAND=1");
      rawGit(dir, "add", "-f", "alpha/.env");
    });
    writeFile(join(b.skillsDir, "alpha", ".env"), "SECRET=1");
    b.editSkill("beta", "from B");

    const error = await rejection(b.api.sync());
    expect(error.code).toBe("GIT");
    expect(error.message).toContain("alpha/.env");
    expect(error.details).toMatchObject({ paths: ["alpha/.env"] });
    expect(b.read("alpha", ".env")).toBe("SECRET=1");
    expect(existsSync(join(b.skillsDir, ".git", "MERGE_HEAD"))).toBe(false);
  });
});
