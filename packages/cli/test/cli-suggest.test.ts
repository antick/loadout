import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createCore, silentLogger } from "@loadout/core";
import type { ProjectSuggestions } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_FAILED, EXIT_OK, EXIT_USAGE } from "../src/run";
import { AGENT, AGENT_DIR, type Run, type Sandbox, createSandbox, writeSkill } from "./harness";

let sandbox: Sandbox;
const cli = (...argv: string[]): Promise<Run> => sandbox.cli(...argv);

beforeEach(() => {
  sandbox = createSandbox();
});

afterEach(() => sandbox.cleanup());

async function install(name: string): Promise<void> {
  writeSkill(join(sandbox.root, "src"), name);
  await cli("skills", "install", `./src/${name}`);
}

/** A project folder with a Cargo.toml and a React package.json, linked as the app links it. */
async function linkedProject(): Promise<string> {
  const project = join(sandbox.root, "app");
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "Cargo.toml"), "[package]\n");
  writeFileSync(join(project, "package.json"), JSON.stringify({ dependencies: { react: "19" } }));
  const core = createCore({ homeDir: sandbox.home, logger: silentLogger, safetyScannerPath: null });
  try {
    await core.api.projects.add(project);
  } finally {
    core.close();
  }
  return project;
}

describe("skills suggest-for", () => {
  it("adds, removes and clears patterns", async () => {
    await install("rust-helper");
    const added = await cli(
      "skills",
      "suggest-for",
      "rust-helper",
      "--add",
      "Cargo.toml",
      "--add",
      "*.rs",
    );
    expect(added.code).toBe(EXIT_OK);
    expect(added.stdout).toContain("  *.rs\n  Cargo.toml");
    const removed = await cli("skills", "suggest-for", "rust-helper", "--remove", "*.rs", "--json");
    expect(removed.json()).toEqual(["Cargo.toml"]);
    const cleared = await cli("skills", "suggest-for", "rust-helper", "--clear");
    expect(cleared.stdout).toContain("has no patterns");
  });
});

describe("project suggest", () => {
  it("lists skills that fit, and adds the good ones for an agent", async () => {
    await install("rust-helper");
    await install("react-patterns");
    await install("unrelated");
    await cli("skills", "suggest-for", "rust-helper", "--add", "Cargo.toml");
    const project = await linkedProject();

    const run = await cli("project", "suggest", "--dir", "./app");
    expect(run.code).toBe(EXIT_OK);
    expect(run.stdout).toContain("Uses: ");
    expect(run.stdout).toMatch(/rust-helper\s+has Cargo\.toml; for Rust\s+good/);
    expect(run.stdout).toMatch(/react-patterns\s+for React\s+good/);
    expect(run.stdout).not.toContain("unrelated");

    const json = (
      await cli("project", "suggest", "--dir", "./app", "--json")
    ).json<ProjectSuggestions>();
    expect(json.technologies).toEqual(expect.arrayContaining(["Rust", "React"]));

    expect((await cli("project", "suggest", "--dir", "./app", "--add")).code).toBe(EXIT_USAGE);
    const add = await cli("project", "suggest", "--dir", "./app", "--add", "--agent", AGENT);
    expect(add.stdout).toContain("Added 2 skills");
    expect(existsSync(join(project, AGENT_DIR, "skills", "react-patterns", "SKILL.md"))).toBe(true);
    const after = await cli("project", "suggest", "--dir", "./app");
    expect(after.stdout).toContain("No library skill fits");
  });

  it("says when the folder is not a linked project", async () => {
    const run = await cli("project", "suggest");
    expect(run.code).toBe(EXIT_FAILED);
    expect(run.stderr + run.stdout).toContain("not in a linked project");
  });
});
