import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { isRunnableFile, runsCode, scriptsTrait, traitsFromFrontmatter } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Core } from "../src/core";
import { listRepoSkills } from "../src/install/repo-scan";
import { parseFrontmatter } from "../src/skills/metadata";
import { skillTraits } from "../src/skills/traits";
import { makeSkill, tempDir, writeFile, createTestCore } from "./helpers";

const codes = (traits: readonly { code: string }[]): string[] => traits.map((trait) => trait.code);

describe("which files can run", () => {
  it("counts scripts by extension and other files only when they are marked executable", () => {
    expect(isRunnableFile("scripts/run.sh", false)).toBe(true);
    expect(isRunnableFile("tools/Fix.PY", false)).toBe(true);
    expect(isRunnableFile("bin/tool", true)).toBe(true);
    expect(isRunnableFile("bin/tool", false)).toBe(false);
  });

  it("does not take a text or media file for a program because it is executable", () => {
    for (const path of ["SKILL.md", "notes.txt", "data.json", "logo.png", "guide.pdf"]) {
      expect(isRunnableFile(path, true)).toBe(false);
    }
  });

  it("lists the first few names and says how many more", () => {
    const files = ["a.sh", "b.sh", "c.sh", "d.sh", "e.sh"].map((path) => ({
      path,
      executable: false,
    }));
    const trait = scriptsTrait(files);
    expect(trait?.params).toEqual({ count: 5, examples: "a.sh, b.sh, c.sh" });
    expect(trait?.message).toContain("5 files");
    expect(trait?.message).toContain("and 2 more");
    expect(scriptsTrait([{ path: "SKILL.md", executable: true }])).toBeNull();
  });
});

describe("what the frontmatter declares", () => {
  it("finds hooks, MCP servers and pre-approved tools", () => {
    const traits = traitsFromFrontmatter({
      hooks: { PreToolUse: [{ command: "echo" }], Stop: [] },
      "mcp-servers": { github: { command: "gh-mcp" } },
      "allowed-tools": "Bash(git *) Read",
    });
    expect(codes(traits)).toEqual(["hooks", "mcp", "tool_grants"]);
    expect(traits[0]?.params).toEqual({ events: "PreToolUse, Stop" });
    expect(traits[1]?.params).toEqual({ servers: "github" });
    expect(traits[2]?.params.tools).toBe("Bash(git *), Read");
  });

  it("reads a list of tools and other spellings of the keys", () => {
    expect(traitsFromFrontmatter({ allowed_tools: ["Read", "Grep"] })[0]?.params.tools).toBe(
      "Read, Grep",
    );
    expect(codes(traitsFromFrontmatter({ mcpServers: ["a"] }))).toEqual(["mcp"]);
  });

  it("ignores keys that are empty or off", () => {
    expect(
      traitsFromFrontmatter({ hooks: {}, "allowed-tools": "  ", "mcp-servers": [], name: "x" }),
    ).toEqual([]);
    expect(traitsFromFrontmatter({ hooks: false })).toEqual([]);
  });

  it("is read when the frontmatter of a document is parsed", () => {
    const parsed = parseFrontmatter("---\nname: a\nhooks:\n  Stop: []\n---\nbody");
    expect(codes(parsed.traits)).toEqual(["hooks"]);
    expect(parseFrontmatter("no frontmatter").traits).toEqual([]);
  });

  it("says which traits put code on the computer", () => {
    expect(runsCode(traitsFromFrontmatter({ "allowed-tools": "Read" }))).toBe(false);
    expect(runsCode(traitsFromFrontmatter({ hooks: { Stop: [] } }))).toBe(true);
  });
});

describe("traits of a skill folder", () => {
  let temp: ReturnType<typeof tempDir>;
  beforeEach(() => {
    temp = tempDir();
  });
  afterEach(() => temp.cleanup());

  it("has none for a skill that is only a document", () => {
    expect(skillTraits(makeSkill(temp.dir, "plain"))).toEqual([]);
  });

  it("finds the scripts it ships, and the frontmatter's declarations, in a fixed order", () => {
    const dir = makeSkill(temp.dir, "tooling", { files: { "scripts/run.sh": "echo hi\n" } });
    writeFile(
      join(dir, "SKILL.md"),
      "---\nname: tooling\ndescription: Does tooling things for you\nallowed-tools: Bash\nhooks:\n  Stop: []\n---\n",
    );
    expect(codes(skillTraits(dir))).toEqual(["scripts", "hooks", "tool_grants"]);
  });

  it("counts a data file marked executable as nothing", () => {
    const dir = makeSkill(temp.dir, "packed", { files: { "notes.txt": "hi" } });
    chmodSync(join(dir, "SKILL.md"), 0o755);
    chmodSync(join(dir, "notes.txt"), 0o755);
    expect(skillTraits(dir)).toEqual([]);
  });

  // Windows files have no executable bit to count.
  it.skipIf(process.platform === "win32")("counts an executable file without an extension", () => {
    const dir = makeSkill(temp.dir, "binary", { files: { "bin/tool": "#!/bin/sh\n" } });
    chmodSync(join(dir, "bin", "tool"), 0o755);
    expect(skillTraits(dir)[0]?.params).toEqual({ count: 1, examples: "bin/tool" });
  });
});

describe("traits in the library and in previews", () => {
  let temp: ReturnType<typeof tempDir>;
  let core: Core;
  beforeEach(() => {
    temp = tempDir();
    core = createTestCore({
      homeDir: temp.dir,
    });
  });
  afterEach(() => {
    core.close();
    temp.cleanup();
  });

  it("are on a library skill, and only where there is something to say", async () => {
    const source = join(temp.dir, "src");
    const plain = await core.api.install.fromPath(makeSkill(source, "plain"));
    const withScript = await core.api.install.fromPath(
      makeSkill(source, "with-script", { files: { "scripts/go.py": "print(1)\n" } }),
    );
    expect(plain.traits).toEqual([]);
    expect(codes(withScript.traits)).toEqual(["scripts"]);
    expect((await core.api.skills.get(withScript.id)).traits[0]?.params.examples).toBe(
      "scripts/go.py",
    );
  });

  it("follow a change to the files", async () => {
    const source = join(temp.dir, "src");
    const skill = await core.api.install.fromPath(makeSkill(source, "grows"));
    expect(skill.traits).toEqual([]);
    await core.api.editor.createFile({ kind: "library", skillId: skill.id }, "scripts/new.sh");
    expect(codes((await core.api.skills.get(skill.id)).traits)).toEqual(["scripts"]);
  });

  it("are shown for a skill in a source before it is installed", () => {
    const root = join(temp.dir, "repo");
    makeSkill(root, "quiet");
    makeSkill(root, "loud", { files: { "run.sh": "echo\n" } });
    mkdirSync(join(root, "loud"), { recursive: true });
    const found = listRepoSkills(root);
    expect(codes(found.find((skill) => skill.name === "loud")?.traits ?? [])).toEqual(["scripts"]);
    expect(found.find((skill) => skill.name === "quiet")?.traits).toEqual([]);
  });
});
