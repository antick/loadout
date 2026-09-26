import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Database } from "../src/db/database";
import { SettingsStore } from "../src/settings/store";
import { parseFrontmatter } from "../src/skills/metadata";
import { SkillStore } from "../src/skills/store";
import { hashDir } from "../src/util/hash";
import { agentKeyFromName, firstFreeName, sanitizeSkillName, slugify } from "../src/util/names";
import { makeSkill, tempDir, writeFile } from "./helpers";

describe("names", () => {
  it("sanitises without slugging", () => {
    expect(sanitizeSkillName("My Skill")).toBe("My Skill");
    expect(sanitizeSkillName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeSkillName(".git")).toBe("git");
    expect(sanitizeSkillName(" ..hidden. ")).toBe("hidden");
    expect(() => sanitizeSkillName(". .")).toThrow();
    expect(sanitizeSkillName('a<b>c:"d')).toBe("a_b_c__d");
    expect(sanitizeSkillName("trailing...")).toBe("trailing");
    expect(sanitizeSkillName("con.txt")).toBe("_con.txt");
    expect(() => sanitizeSkillName("..")).toThrow();
  });

  it("slugs and generates keys", () => {
    expect(slugify("Hello World!")).toBe("hello-world");
    expect(slugify("***")).toBe("skill");
    expect(agentKeyFromName("My Agent", new Set(["my_agent"]))).toBe("my_agent_2");
    expect(firstFreeName("x", (n) => n === "x-3")).toBe("x-3");
  });
});

describe("frontmatter", () => {
  it("reads name and description", () => {
    expect(parseFrontmatter("---\nname: a\ndescription: b c\n---\nbody")).toEqual({
      name: "a",
      description: "b c",
    });
    expect(parseFrontmatter("no frontmatter")).toEqual({ name: null, description: null });
    expect(parseFrontmatter("---\nname: [oops\n---")).toEqual({ name: null, description: null });
  });
});

describe("storage", () => {
  let temp: ReturnType<typeof tempDir>;
  beforeEach(() => {
    temp = tempDir();
  });
  afterEach(() => temp.cleanup());

  it("hashes content, ignoring noise files", () => {
    const a = makeSkill(temp.dir, "a", { files: { "scripts/run.sh": "echo hi" } });
    const before = hashDir(a);
    writeFile(join(a, ".DS_Store"), "noise");
    expect(hashDir(a)).toBe(before);
    writeFile(join(a, "scripts/run.sh"), "echo bye");
    expect(hashDir(a)).not.toBe(before);
    expect(hashDir(join(temp.dir, "missing"))).toBeNull();
  });

  it("migrates, stores skills, tags and settings", () => {
    const db = new Database(join(temp.dir, "test.db"));
    const store = new SkillStore(db);
    const skill = store.insert({
      name: "alpha",
      description: null,
      sourceType: "local",
      libraryPath: join(temp.dir, "skills/alpha"),
      contentHash: "h",
      updateStatus: "local_only",
    });
    store.setTags(skill.id, ["b", "a", "a", " "]);
    expect(store.get(skill.id).tags).toEqual(["a", "b"]);
    store.renameTag("a", "b");
    expect(store.allTags()).toEqual(["b"]);
    store.upsertDeployment(skill.id, "claude_code", "/x/alpha", "symlink", "h");
    expect(store.get(skill.id).deployments).toHaveLength(1);
    expect(store.resolve("ALPHA").id).toBe(skill.id);

    const settings = new SettingsStore(db);
    expect(settings.get("deployMode")).toBe("symlink");
    settings.set("deployMode", "copy");
    expect(settings.all().deployMode).toBe("copy");
    expect(() => settings.set("proxyUrl", "ftp://x")).toThrow();
    db.close();
  });
});

describe("portable metadata", () => {
  it("ignores metadata files that point outside the skills folder", async () => {
    const { createTestWorld } = await import("./helpers");
    const world = createTestWorld();
    try {
      makeSkill(world.root, "outside");
      writeFile(
        join(world.ctx.paths.metadataDir, "skills", "evil.json"),
        JSON.stringify({
          id: "evil",
          path: "../../../outside",
          tags: [],
          source: { type: "import" },
          createdAt: 1,
        }),
      );
      writeFile(join(world.ctx.paths.metadataDir, "schema.json"), "{}");
      world.portable.rebuild({ authoritative: true });
      expect(world.store.list()).toHaveLength(0);
    } finally {
      world.cleanup();
    }
  });
});
