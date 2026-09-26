import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseDocument } from "yaml";
import { checkSkillDocument, newSkillNameProblem, toSkillNameInput } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentRegistry } from "../src/agents/registry";
import { createDeployService } from "../src/deploy";
import { createFileHistory } from "../src/editor";
import { type SkillsService, createSkillsService } from "../src/skills/service";
import { type TestWorld, createTestWorld, makeSkill } from "./helpers";
import {
  type InstallHarness,
  createInstallHarness,
  isolateTmpDir,
  skillsDirOf,
} from "./install-fixtures";

let world: TestWorld;
let install: InstallHarness;
let skills: SkillsService;
let tmp: string;
let restoreTmp: () => void;

beforeEach(() => {
  world = createTestWorld();
  tmp = join(world.root, "tmp");
  restoreTmp = isolateTmpDir(tmp);
  install = createInstallHarness(world);
  skills = createSkillsService(world.ctx, {
    store: world.store,
    removeDeployments: async () => undefined,
    history: createFileHistory(world.ctx.paths.historyDir),
    install: install.installIntoLibrary,
    rename: {
      deploy: createDeployService(world.ctx, {
        store: world.store,
        registry: new AgentRegistry(world.ctx),
      }),
      projectSkillFolders: () => [],
    },
  });
});

afterEach(() => {
  restoreTmp();
  world.cleanup();
});

describe("create a skill", () => {
  it("writes a valid SKILL.md into a folder named after the skill", async () => {
    const skill = await skills.api.create({
      name: "code-review",
      description: 'Review a diff: "risky" changes first, then style.',
    });

    expect(skill).toMatchObject({
      name: "code-review",
      dirName: "code-review",
      description: 'Review a diff: "risky" changes first, then style.',
      sourceType: "import",
      sourceRef: null,
      updateStatus: "local_only",
      libraryPath: join(skillsDirOf(world), "code-review"),
    });
    const document = readFileSync(join(skill.libraryPath, "SKILL.md"), "utf8");
    expect(document).toContain("# Code review");
    expect(checkSkillDocument(document, "code-review").issues).toEqual([]);
    const frontmatter = parseDocument(document.split("---")[1] ?? "").toJS();
    expect(frontmatter).toEqual({ name: "code-review", description: skill.description });
    expect(world.ctx.activity.list()[0]).toMatchObject({ kind: "create", subject: "code-review" });
    // The draft folder is gone once the skill is in the library.
    expect(readdirSync(tmp)).toEqual([]);
  });

  it("trims the input", async () => {
    const skill = await skills.api.create({ name: "  tidy  ", description: "  Tidy up.  " });
    expect(skill).toMatchObject({ name: "tidy", description: "Tidy up." });
  });

  it("refuses a name outside the format, and an empty description", async () => {
    await expect(skills.api.create({ name: "Code Review", description: "x" })).rejects.toThrow(
      /lowercase/,
    );
    await expect(skills.api.create({ name: "a".repeat(65), description: "x" })).rejects.toThrow(
      /at most 64/,
    );
    await expect(skills.api.create({ name: "nul", description: "x" })).rejects.toThrow(/Windows/);
    await expect(skills.api.create({ name: "ok", description: "  " })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(world.store.list()).toEqual([]);
  });

  it("refuses a name a library skill or folder already has, in any case", async () => {
    await install.api.fromPath(makeSkill(join(world.root, "src"), "Alpha"));
    await expect(skills.api.create({ name: "alpha", description: "x" })).rejects.toMatchObject({
      code: "ALREADY_EXISTS",
    });
    mkdirSync(join(skillsDirOf(world), "stray"), { recursive: true });
    await expect(skills.api.create({ name: "stray", description: "x" })).rejects.toMatchObject({
      code: "ALREADY_EXISTS",
    });
    expect(world.store.list()).toHaveLength(1);
  });
});

describe("new skill names", () => {
  it("follows the Agent Skills name rules", () => {
    expect(newSkillNameProblem("pdf-tools-2")).toBeNull();
    expect(newSkillNameProblem("")).toBe("empty");
    expect(newSkillNameProblem("-pdf")).toBe("format");
    expect(newSkillNameProblem("pdf--tools")).toBe("format");
    expect(newSkillNameProblem("pdf.tools")).toBe("format");
    expect(newSkillNameProblem("com1")).toBe("reserved");
  });

  it("helps typing by lowering case and turning spaces into hyphens", () => {
    expect(toSkillNameInput("Code Review_Helper")).toBe("code-review-helper");
    expect(toSkillNameInput("PDF.tools")).toBe("pdf.tools");
  });
});
