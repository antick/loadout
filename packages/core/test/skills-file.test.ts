import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SKILLS_FILE_NAME, SKILLS_LOCK_NAME, type SkillsLock } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentRegistry } from "../src/agents";
import { createGitClient } from "../src/install/git-client";
import { parseSkillsFile } from "../src/skills-file/format";
import { createSkillsFileService } from "../src/skills-file/service";
import { createRemovedStore } from "../src/storage";
import { type TestWorld, createTestWorld, makeSkill, writeFile } from "./helpers";
import {
  commitAll,
  createInstallHarness,
  initRepo,
  isolateTmpDir,
  redirectGithubTo,
} from "./install-fixtures";

let world: TestWorld;
let remote: string;
let project: string;
let restores: (() => void)[];
let api: ReturnType<typeof createSkillsFileService>["api"];

const TOML = `agents = ["claude_code", "codex"]

[[sources]]
url = "acme/skills"
skills = ["pdf"]
`;

beforeEach(() => {
  world = createTestWorld();
  const remotes = join(world.root, "remotes");
  restores = [isolateTmpDir(join(world.root, "tmp")), redirectGithubTo(remotes)];
  remote = initRepo(join(remotes, "acme", "skills.git"));
  makeSkill(join(remote, "skills"), "pdf", { files: { "scripts/run.sh": "echo one\n" } });
  makeSkill(join(remote, "skills"), "docx");
  commitAll(remote, "initial");
  project = join(world.root, "project");
  mkdirSync(join(project, "src"), { recursive: true });
  writeFileSync(join(project, SKILLS_FILE_NAME), TOML);
  api = createSkillsFileService(world.ctx, {
    git: createGitClient(world.ctx),
    registry: new AgentRegistry(world.ctx),
    store: world.store,
    removed: createRemovedStore(world.ctx, { store: world.store }),
  }).api;
});

afterEach(() => {
  for (const restore of restores) restore();
  world.cleanup();
});

const lock = (): SkillsLock =>
  JSON.parse(readFileSync(join(project, SKILLS_LOCK_NAME), "utf8")) as SkillsLock;
const read = (...parts: string[]): string => readFileSync(join(project, ...parts), "utf8");
const actions = (plan: { entries: { folder: string; action: string }[] }): string[][] =>
  plan.entries.map((entry) => [entry.folder, entry.action]);

describe("skills.toml format", () => {
  it("reads a file and says exactly what is wrong with a broken one", () => {
    expect(parseSkillsFile("f", TOML)).toEqual({
      agents: ["claude_code", "codex"],
      gitignore: false,
      sources: [{ url: "acme/skills", ref: null, skills: ["pdf"] }],
    });
    expect(
      parseSkillsFile("f", `agents = ["a"]\n[[sources]]\nurl = "x/y"\nskills = ["*"]`),
    ).toMatchObject({
      sources: [{ skills: null }],
    });
    expect(() => parseSkillsFile("f", "[[sources]]\nurl = 'x/y'")).toThrow(/say which agents/);
    expect(() => parseSkillsFile("f", `agents = ["a"]\nsauces = 1`)).toThrow(/unknown key sauces/);
    expect(() => parseSkillsFile("f", `agents = ["a"]\n[[sources]]\nref = "main"`)).toThrow(
      /needs url/,
    );
    expect(() => parseSkillsFile("f", `agents = [`)).toThrow(/not valid TOML/);
  });
});

describe("apply", () => {
  it("writes the skills into each agent's project folder and pins the commit", async () => {
    const result = await api.apply(project);
    expect(result).toMatchObject({ written: 2, removed: 0, kept: [] });
    expect(read(".claude", "skills", "pdf", "scripts", "run.sh")).toBe("echo one\n");
    expect(existsSync(join(project, ".agents", "skills", "pdf", "SKILL.md"))).toBe(true);
    expect(existsSync(join(project, ".claude", "skills", "docx"))).toBe(false);
    const pinned = lock();
    expect(pinned.sources).toEqual([
      { url: "acme/skills", ref: null, revision: expect.stringMatching(/^[0-9a-f]{40}$/) },
    ]);
    expect(pinned.folders.map((f) => f.folder)).toEqual([
      ".agents/skills/pdf",
      ".claude/skills/pdf",
    ]);
    // The library is not touched: project skills come straight from the source.
    expect(world.store.list()).toEqual([]);
    expect(actions(await api.plan(project))).toEqual([
      [".claude/skills/pdf", "same"],
      [".agents/skills/pdf", "same"],
    ]);
  });

  it("stays on the locked commit until asked to update", async () => {
    await api.apply(project);
    const first = lock().sources[0]?.revision;
    writeFile(join(remote, "skills", "pdf", "scripts", "run.sh"), "echo two\n");
    commitAll(remote, "newer");

    const pinned = await api.apply(project);
    expect(pinned.written).toBe(0);
    expect(read(".claude", "skills", "pdf", "scripts", "run.sh")).toBe("echo one\n");

    const plan = await api.plan(project, { update: true });
    expect(plan.sources[0]).toMatchObject({ moved: true });
    expect(actions(plan)).toEqual([
      [".claude/skills/pdf", "update"],
      [".agents/skills/pdf", "update"],
    ]);
    await api.apply(project, { update: true });
    expect(read(".claude", "skills", "pdf", "scripts", "run.sh")).toBe("echo two\n");
    expect(lock().sources[0]?.revision).not.toBe(first);
  });

  it("never replaces a folder changed by hand unless forced, and keeps the old one", async () => {
    await api.apply(project);
    writeFile(join(project, ".claude", "skills", "pdf", "notes.md"), "mine\n");
    writeFile(join(remote, "skills", "pdf", "scripts", "run.sh"), "echo two\n");
    commitAll(remote, "newer");

    const careful = await api.apply(project, { update: true });
    expect(careful.kept).toEqual([".claude/skills/pdf"]);
    expect(read(".claude", "skills", "pdf", "notes.md")).toBe("mine\n");
    expect(read(".agents", "skills", "pdf", "scripts", "run.sh")).toBe("echo two\n");

    const forced = await api.apply(project, { update: true, force: true });
    expect(forced.kept).toEqual([]);
    expect(existsSync(join(project, ".claude", "skills", "pdf", "notes.md"))).toBe(false);
    const removed = createRemovedStore(world.ctx, { store: world.store }).list();
    expect(removed.map((entry) => entry.name)).toContain("pdf");
  });

  it("leaves a folder someone else put there alone", async () => {
    writeFile(join(project, ".claude", "skills", "pdf", "SKILL.md"), "---\nname: pdf\n---\nmine\n");
    const result = await api.apply(project);
    expect(result.kept).toEqual([".claude/skills/pdf"]);
    expect(read(".claude", "skills", "pdf", "SKILL.md")).toContain("mine");
  });

  it("prunes what the file no longer lists, and unapply removes the rest", async () => {
    writeFileSync(join(project, SKILLS_FILE_NAME), TOML.replace(`["pdf"]`, `["pdf", "docx"]`));
    await api.apply(project);
    expect(existsSync(join(project, ".claude", "skills", "docx"))).toBe(true);

    writeFileSync(join(project, SKILLS_FILE_NAME), TOML);
    expect(actions(await api.plan(project))).toEqual([
      [".claude/skills/pdf", "same"],
      [".agents/skills/pdf", "same"],
    ]);
    const pruned = await api.apply(project, { prune: true });
    expect(pruned.removed).toBe(2);
    expect(existsSync(join(project, ".claude", "skills", "docx"))).toBe(false);
    expect(lock().folders.map((f) => f.folder)).toEqual([
      ".agents/skills/pdf",
      ".claude/skills/pdf",
    ]);

    writeFile(join(project, ".agents", "skills", "pdf", "notes.md"), "mine\n");
    const gone = await api.unapply(project);
    expect(gone).toMatchObject({ removed: 1, kept: [".agents/skills/pdf"] });
    expect(existsSync(join(project, ".claude", "skills", "pdf"))).toBe(false);
    expect(existsSync(join(project, ".agents", "skills", "pdf", "notes.md"))).toBe(true);
  });

  it("ignores lock entries that point outside the project", async () => {
    const outside = join(world.root, "precious");
    writeFile(join(outside, "SKILL.md"), "keep\n");
    writeFileSync(
      join(project, SKILLS_LOCK_NAME),
      JSON.stringify({
        version: 1,
        sources: [],
        folders: [{ folder: "../precious", url: "acme/skills", skillPath: "x", hash: "h" }],
      }),
    );
    await api.unapply(project, { force: true });
    expect(readFileSync(join(outside, "SKILL.md"), "utf8")).toBe("keep\n");
  });

  it("finds the file from a folder inside the project", async () => {
    expect((await api.find(join(project, "src")))?.root).toBe(project);
    expect(await api.find(world.root)).toBeNull();
  });

  it("keeps its own block in .gitignore when asked, and only that", async () => {
    writeFileSync(join(project, ".gitignore"), "node_modules/\n");
    writeFileSync(join(project, SKILLS_FILE_NAME), `gitignore = true\n${TOML}`);
    await api.apply(project);
    const ignored = read(".gitignore");
    expect(ignored).toContain("node_modules/");
    expect(ignored).toContain("/.claude/skills/pdf/");
    writeFileSync(join(project, SKILLS_FILE_NAME), TOML);
    await api.apply(project);
    expect(read(".gitignore")).toBe("node_modules/\n");
  });
});

describe("create and suggest", () => {
  it("lists the project's skills the library knows from a repository", async () => {
    const install = createInstallHarness(world);
    const preview = await install.api.previewGit("acme/skills");
    await install.api.confirmGit(preview.previewId, [{ relPath: "pdf", name: "pdf" }]);
    const elsewhere = join(world.root, "other");
    makeSkill(join(elsewhere, ".claude", "skills"), "pdf");
    makeSkill(join(elsewhere, ".claude", "skills"), "unknown");
    const init = await api.suggest(elsewhere);
    expect(init.agents).toEqual(["claude_code"]);
    expect(init.sources).toEqual([
      { url: expect.stringContaining("acme/skills"), ref: null, skills: ["pdf"] },
    ]);
    const info = await api.create(elsewhere, init);
    expect(readFileSync(info.path, "utf8")).toContain('skills = [ "pdf" ]');
    await expect(api.create(elsewhere, init)).rejects.toMatchObject({ code: "ALREADY_EXISTS" });
  });
});
