import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanSuggestPatterns, suggestPatternProblem } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type SkillSide, planSkill } from "../src/backup/merge-plan";
import type { Core } from "../src/core";
import { firstMatch } from "../src/suggest/glob";
import { matchSkills } from "../src/suggest/match";
import { readProjectFiles } from "../src/suggest/project-files";
import { makeSkill, tempDir, writeFile, createTestCore } from "./helpers";
import { skillRecord } from "./skill-records";
import { type WorkspaceWorld, createWorkspaceWorld } from "./workspace-world";

describe("suggest-for patterns", () => {
  const paths = [
    "Cargo.toml",
    "src",
    "src/main.rs",
    "prisma",
    "prisma/schema.prisma",
    ".github",
    ".github/workflows",
    ".github/workflows/ci.yml",
  ];

  it("match names anywhere, paths from the top, like .gitignore", () => {
    expect(firstMatch("Cargo.toml", paths)).toBe("Cargo.toml");
    expect(firstMatch("*.rs", paths)).toBe("src/main.rs");
    expect(firstMatch("prisma/**", paths)).toBe("prisma/schema.prisma");
    expect(firstMatch("**/*.prisma", paths)).toBe("prisma/schema.prisma");
    expect(firstMatch(".github/workflows/", paths)).toBe(".github/workflows");
    expect(firstMatch(".github/workflows/*.yml", paths)).toBe(".github/workflows/ci.yml");
    expect(firstMatch("main.rs", paths)).toBe("src/main.rs");
    expect(firstMatch("src/*.ts", paths)).toBeNull();
    expect(firstMatch("CARGO.TOML", paths)).toBe("Cargo.toml");
  });

  it("drops blanks, repeats and patterns that leave the project", () => {
    expect(cleanSuggestPatterns([" *.rs ", "*.rs", "", "../x", "/etc/passwd", 7, "a\\b"])).toEqual([
      "*.rs",
      "a/b",
    ]);
    expect(suggestPatternProblem("x".repeat(201))).toBe("too_long");
  });
});

describe("matching skills to a project", () => {
  const files = {
    paths: ["package.json", "tsconfig.json", "src", "src/app.tsx", "Dockerfile"],
    packages: new Set(["react", "vitest"]),
  };

  it("finds technologies and the skills that name them, strongest first", () => {
    const found = matchSkills(
      [
        skillRecord("readme", { name: "readme-writer", description: "Write a README." }),
        skillRecord("react", { name: "react-patterns", description: "Hooks and state." }),
        skillRecord("tests", { name: "unit-tests", description: "Write tests with Vitest." }),
        skillRecord("tagged", { name: "containers", tags: ["docker"] }),
        skillRecord("rust", { name: "rust-helper", suggestFor: ["Cargo.toml"] }),
        skillRecord("go", { name: "planning", description: "Plans you can go through." }),
      ],
      files,
      new Set(),
    );
    expect(found.technologies).toEqual(
      expect.arrayContaining(["TypeScript", "JavaScript", "React", "Vitest", "Docker"]),
    );
    expect(found.technologies).not.toContain("Rust");
    expect(found.suggestions.map((s) => [s.skillId, s.strength])).toEqual([
      ["react", "strong"],
      ["tagged", "strong"],
      ["tests", "weak"],
    ]);
    expect(found.suggestions[0]?.reasons).toEqual([{ kind: "tech", tech: "React", where: "name" }]);
  });

  it("puts a skill's own pattern first-class and leaves excluded skills out", () => {
    const rust = skillRecord("rust", { suggestFor: ["*.tsx"] });
    const react = skillRecord("react", { name: "react-patterns" });
    const found = matchSkills([rust, react], files, new Set(["react"]));
    expect(found.suggestions).toEqual([
      {
        skillId: "rust",
        strength: "strong",
        reasons: [{ kind: "pattern", pattern: "*.tsx", match: "src/app.tsx" }],
      },
    ]);
  });
});

describe("reading a project", () => {
  let world: WorkspaceWorld;
  beforeEach(() => {
    world = createWorkspaceWorld();
  });
  afterEach(() => world.cleanup());

  it("collects paths and dependencies, skipping dependency and build folders", () => {
    const repo = join(world.root, "repo");
    writeFile(
      join(repo, "package.json"),
      JSON.stringify({ dependencies: { React: "19" }, devDependencies: { vitest: "3" } }),
    );
    writeFile(join(repo, "api", "requirements.txt"), "Django>=5\nfastapi[all]==0.1\n# note\n");
    writeFile(join(repo, "svc", "pyproject.toml"), '[project]\ndependencies = ["pytest>=8"]\n');
    writeFile(join(repo, "node_modules", "left-pad", "package.json"), '{"dependencies":{"x":"1"}}');
    writeFile(join(repo, "a", "b", "c", "d", "deep.txt"), "");
    const found = readProjectFiles(repo);
    expect([...found.packages].sort()).toEqual(["django", "fastapi", "pytest", "react", "vitest"]);
    expect(found.paths).toContain("api/requirements.txt");
    expect(found.paths.some((path) => path.includes("node_modules"))).toBe(false);
    expect(found.paths).toContain("a/b/c/d");
    expect(found.paths).not.toContain("a/b/c/d/deep.txt");
  });

  it("suggests library skills for a saved project, minus ones there or dismissed", async () => {
    world.installAgents(".claude");
    const repo = join(world.root, "work", "shop");
    writeFile(join(repo, "package.json"), JSON.stringify({ dependencies: { react: "19" } }));
    const react = world.addSkill("react-patterns");
    const docker = world.addSkill("docker-deploy");
    world.store.update(docker.id, { suggestFor: ["package.json"] });
    const present = world.addSkill("typescript-style");
    const project = await world.projects.api.add(repo);
    makeSkill(join(repo, ".claude", "skills"), present.dirName);

    const first = await world.projects.api.suggestSkills(project.id);
    expect(first.suggestions.map((s) => s.skillId).sort()).toEqual([docker.id, react.id].sort());

    await world.projects.api.setSuggestionDismissed(project.id, react.id, true);
    const second = await world.projects.api.suggestSkills(project.id);
    expect(second.suggestions.map((s) => s.skillId)).toEqual([docker.id]);
    expect(second.dismissed).toEqual([react.id]);

    await world.projects.api.setSuggestionDismissed(project.id, react.id, false);
    expect((await world.projects.api.suggestSkills(project.id)).dismissed).toEqual([]);
  });
});

/** One side of a merge: the same skill, with these patterns. */
function side(suggestFor?: string[]): SkillSide {
  return {
    path: "rust",
    treeHash: "t",
    meta: { id: "s", path: "rust", tags: [], source: { type: "local" }, createdAt: 0, suggestFor },
  };
}

describe("keeping suggest-for patterns", () => {
  let temp: { dir: string; cleanup: () => void };
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

  it("saves them on the skill and in its portable metadata, without touching its change time", async () => {
    const skill = await core.api.install.fromPath(makeSkill(join(temp.dir, "src"), "rust-helper"));
    const saved = await core.api.skills.setSuggestFor(skill.id, ["*.rs", " Cargo.toml ", "../no"]);
    expect(saved.suggestFor).toEqual(["*.rs", "Cargo.toml"]);
    expect(saved.updatedAt).toBe(skill.updatedAt);
    core.ctx.touched("skills");
    await new Promise((resolve) => setImmediate(resolve));
    const metaFile = join(core.ctx.paths.skillsDir, ".loadout", "skills", `${skill.id}.json`);
    const file = JSON.parse(readFileSync(metaFile, "utf8")) as { suggestFor?: string[] };
    expect(file.suggestFor).toEqual(["*.rs", "Cargo.toml"]);
    expect((await core.api.skills.setSuggestFor(skill.id, [])).suggestFor).toEqual([]);
  });

  it("merges them like tags when two devices changed them", () => {
    const plan = planSkill("s", {
      base: side(["*.rs"]),
      ours: side(["*.rs", "Cargo.toml"]),
      theirs: side([]),
    });
    expect(plan.meta?.suggestFor).toEqual(["Cargo.toml"]);
    expect(plan.outcome).toBe("updated");
    const untouched = planSkill("s", { base: side(), ours: side(), theirs: side() });
    expect(untouched.meta?.suggestFor).toBeUndefined();
    expect(untouched.outcome).toBe("unchanged");
  });
});
