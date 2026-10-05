import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { firstFreeName } from "@loadout/shared";
import { Database } from "../src/db/database";
import { SettingsStore } from "../src/settings/store";
import { parseFrontmatter } from "../src/skills/metadata";
import { repointSources } from "../src/deploy/evidence";
import { SkillStore } from "../src/skills/store";
import { hashDir } from "../src/util/hash";
import { agentKeyFromName, sanitizeSkillName, slugify } from "../src/util/names";
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

const readManualOnly = (value: string): boolean =>
  parseFrontmatter(`---\nname: a\ndisable-model-invocation: ${value}\n---\n`).manualOnly;

describe("frontmatter", () => {
  it("reads name and description", () => {
    const empty = {
      name: null,
      description: null,
      manualOnly: false,
      traits: [],
      behaviorFields: [],
    };
    expect(parseFrontmatter("---\nname: a\ndescription: b c\n---\nbody")).toEqual({
      name: "a",
      description: "b c",
      manualOnly: false,
      traits: [],
      behaviorFields: [],
    });
    expect(parseFrontmatter("no frontmatter")).toEqual(empty);
    expect(parseFrontmatter("---\nname: [oops\n---")).toEqual(empty);
  });

  it("reads disable-model-invocation as manual only", () => {
    expect(readManualOnly("true")).toBe(true);
    expect(readManualOnly('"TRUE"')).toBe(true);
    expect(readManualOnly("false")).toBe(false);
    expect(readManualOnly("yes")).toBe(false);
    expect(parseFrontmatter("---\nname: a\n---\n").manualOnly).toBe(false);
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

  it("moves a skill's last changed time on edits only", () => {
    const db = new Database(join(temp.dir, "test.db"));
    const store = new SkillStore(db);
    const source = join(temp.dir, "src", "alpha");
    const { id } = store.insert({
      name: "alpha",
      description: "Old words",
      sourceType: "local",
      sourceRef: source,
      libraryPath: join(temp.dir, "skills/alpha"),
      contentHash: "h",
      updateStatus: "local_only",
      updatedAt: 1000,
    });
    const at = (): number => store.get(id).updatedAt;
    // Where it comes from and how it was checked: not an edit.
    repointSources(store, source);
    expect(store.get(id).sourceRef).toBe(join(temp.dir, "skills/alpha"));
    store.update(id, { updateStatus: "error", lastCheckedAt: 5, note: "mine", authored: true });
    store.update(id, { libraryPath: join(temp.dir, "moved/alpha") });
    // The same words written again change nothing.
    store.update(id, { name: "alpha", description: "Old words", contentHash: "h" });
    expect(at()).toBe(1000);

    store.update(id, { description: "New words" });
    expect(at()).toBeGreaterThan(1000);
    store.update(id, { contentHash: "h2", updatedAt: 2000 });
    expect(at()).toBe(2000);
    store.update(id, { contentHash: "h3" });
    expect(at()).toBeGreaterThan(2000);
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

  it("keeps a skill whose metadata file carries another id for the same folder", async () => {
    const { createTestWorld } = await import("./helpers");
    const world = createTestWorld();
    try {
      const libraryPath = makeSkill(world.ctx.paths.skillsDir, "alpha");
      const skill = world.store.insert({
        name: "alpha",
        description: null,
        sourceType: "local",
        libraryPath,
        contentHash: "x",
        updateStatus: "local_only",
      });
      writeFile(
        join(world.ctx.paths.metadataDir, "skills", "other-id.json"),
        JSON.stringify({
          id: "other-id",
          path: "alpha",
          tags: ["kept"],
          source: { type: "local" },
          createdAt: 1,
        }),
      );
      writeFile(join(world.ctx.paths.metadataDir, "schema.json"), "{}");
      world.portable.rebuild({ authoritative: true });
      expect(world.store.list().map((row) => row.id)).toEqual([skill.id]);
      expect(world.store.get(skill.id).tags).toEqual(["kept"]);
    } finally {
      world.cleanup();
    }
  });
});
