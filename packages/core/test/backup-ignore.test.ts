import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Device, isolateGit, joinRemote, seedRemote } from "./backup-world";
import { tempDir, writeFile } from "./helpers";

const ignoreFile = (device: Device): string =>
  readFileSync(join(device.skillsDir, ".gitignore"), "utf8");
const tracked = (device: Device): string[] => device.git("ls-files").split("\n");

/** Leave local-only files out of the backup, and keep them through merges. */
describe("backup ignore rules", () => {
  let temp: ReturnType<typeof tempDir>;
  let a: Device;
  let b: Device;

  beforeEach(async () => {
    temp = tempDir();
    isolateGit(temp.dir);
    const seeded = await seedRemote(temp.dir, ["alpha", "beta"]);
    a = seeded.a;
    b = await joinRemote(temp.dir, seeded.remote);
  });
  afterEach(() => {
    a.close();
    b.close();
    temp.cleanup();
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

    expect(outcome.merge?.fastForward).toBe(true);
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

    await b.api.resolveConflict(conflict?.skillKey ?? "", "use_remote");
    expect(b.read("alpha")).toBe("A's version");
    expect(b.read("alpha", ".env")).toBe("SECRET=1");
  });
});
