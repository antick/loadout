import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  LIBRARY_DIR_NAME,
  itemRelativePath,
  parseMarkdown,
  parseTomlStrings,
} from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Core } from "../src/core";
import { tempDir, createTestCore } from "./helpers";

/** Subagents, commands and rules: library, deploys with conversion, ownership, import. */

let temp: ReturnType<typeof tempDir>;
let home: string;
let core: Core;

const REVIEWER = { kind: "subagent", name: "reviewer" } as const;
const CLAUDE = { agentKey: "claude_code", projectId: null };
const OPENCODE = { agentKey: "opencode", projectId: null };

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

beforeEach(() => {
  temp = tempDir();
  home = join(temp.dir, "home");
  // Installed agents: their folders exist.
  mkdirSync(join(home, ".claude"), { recursive: true });
  mkdirSync(join(home, ".config", "opencode"), { recursive: true });
  mkdirSync(join(home, ".gemini"), { recursive: true });
  core = createTestCore({
    homeDir: home,
    configDir: join(temp.dir, "config"),
  });
});

afterEach(() => {
  core.close();
  temp.cleanup();
});

describe("library items", () => {
  it("creates from a template, lists, saves and refuses a stale save", async () => {
    await core.api.items.create(REVIEWER);
    const path = join(home, LIBRARY_DIR_NAME, "skills", itemRelativePath("subagent", "reviewer"));
    expect(existsSync(path)).toBe(true);
    const [listed] = await core.api.items.list("subagent");
    expect(listed).toMatchObject({ kind: "subagent", name: "reviewer" });
    expect(listed?.description).toContain("subagent");

    const detail = await core.api.items.get(REVIEWER);
    const next = detail.content.replace("You are", "You really are");
    await core.api.items.save(REVIEWER, { content: next, baseHash: detail.hash });
    await expect(
      core.api.items.save(REVIEWER, { content: "x", baseHash: detail.hash }),
    ).rejects.toMatchObject({ code: "CHANGED_ON_DISK" });
    await expect(core.api.items.create(REVIEWER)).rejects.toMatchObject({ code: "ALREADY_EXISTS" });
    await expect(
      core.api.items.create({ kind: "command", name: "Bad Name" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("lists only the agents that read a kind, with their folders", async () => {
    const places = await core.api.items.places("rule");
    const cursor = places.find((place) => place.agentKey === "cursor");
    expect(cursor).toMatchObject({
      globalDir: null,
      projectDir: ".cursor/rules",
      extension: ".mdc",
    });
    const claude = places.find((place) => place.agentKey === "claude_code");
    expect(claude?.globalDir).toBe(join(home, ".claude", "rules"));
    expect(places.some((place) => place.agentKey === "opencode")).toBe(false);
  });
});

describe("deploying items", () => {
  const content =
    "---\nname: reviewer\ndescription: Reviews code.\ntools: Read, Grep\n---\n\nReview it.\n";

  it("writes each agent's own format and follows library edits", async () => {
    await core.api.items.create(REVIEWER, content);
    await core.api.items.deploy(REVIEWER, CLAUDE);
    const item = await core.api.items.deploy(REVIEWER, OPENCODE);
    const claudeFile = join(home, ".claude", "agents", "reviewer.md");
    const opencodeFile = join(home, ".config", "opencode", "agents", "reviewer.md");
    expect(readFileSync(claudeFile, "utf8")).toContain("tools: Read, Grep");
    expect(parseMarkdown(readFileSync(opencodeFile, "utf8")).fields).toMatchObject({
      mode: "subagent",
      permission: { read: "allow", grep: "allow", edit: "deny" },
    });
    expect(item.deployments.map((d) => d.state)).toEqual(["in_sync", "in_sync"]);

    // Edited in the agent's folder: left alone from now on.
    writeFileSync(opencodeFile, "my own version\n");
    const detail = await core.api.items.get(REVIEWER);
    const saved = await core.api.items.save(REVIEWER, {
      content: content.replace("Review it.", "Review it well."),
      baseHash: detail.hash,
    });
    expect(readFileSync(claudeFile, "utf8")).toContain("Review it well.");
    expect(readFileSync(opencodeFile, "utf8")).toBe("my own version\n");
    const states = Object.fromEntries(saved.deployments.map((d) => [d.agentKey, d.state]));
    expect(states).toEqual({ claude_code: "in_sync", opencode: "edited" });
  });

  it("follows an item changed outside the app, as after a sync", async () => {
    await core.api.items.create(REVIEWER, content);
    await core.api.items.deploy(REVIEWER, CLAUDE);
    const libraryFile = (await core.api.items.get(REVIEWER)).path;
    writeFileSync(libraryFile, content.replace("Review it.", "Synced text."));
    await core.background.libraryChangedOnDisk();
    expect(readFileSync(join(home, ".claude", "agents", "reviewer.md"), "utf8")).toContain(
      "Synced text.",
    );
  });

  it("never replaces a file it did not write, unless asked, and keeps the old one", async () => {
    const theirs = join(home, ".claude", "agents", "reviewer.md");
    write(theirs, "hand made\n");
    await core.api.items.create(REVIEWER, content);
    const preview = await core.api.items.preview(REVIEWER, CLAUDE);
    expect(preview.occupied).toBe(true);
    await expect(core.api.items.deploy(REVIEWER, CLAUDE)).rejects.toMatchObject({
      code: "TARGET_CONFLICT",
    });
    expect(readFileSync(theirs, "utf8")).toBe("hand made\n");

    await core.api.items.deploy(REVIEWER, CLAUDE, { replace: true });
    expect(readFileSync(`${theirs}.loadout-old`, "utf8")).toBe("hand made\n");
    expect(readFileSync(theirs, "utf8")).toContain("Review it.");
  });

  it("removes its own files on undeploy and delete, but keeps edited ones", async () => {
    await core.api.items.create(REVIEWER, content);
    await core.api.items.deploy(REVIEWER, CLAUDE);
    await core.api.items.deploy(REVIEWER, OPENCODE);
    const opencodeFile = join(home, ".config", "opencode", "agents", "reviewer.md");
    writeFileSync(opencodeFile, "edited there\n");

    const undeployed = await core.api.items.undeploy(REVIEWER, CLAUDE);
    expect(undeployed.removed).toHaveLength(1);
    expect(existsSync(join(home, ".claude", "agents", "reviewer.md"))).toBe(false);

    const removed = await core.api.items.remove(REVIEWER);
    expect(removed).toEqual({ removed: [], kept: [opencodeFile] });
    expect(readFileSync(opencodeFile, "utf8")).toBe("edited there\n");
    expect(await core.api.items.list()).toEqual([]);
  });

  it("deploys into a project, in the project's folder for the agent", async () => {
    const projectDir = join(temp.dir, "app");
    mkdirSync(projectDir, { recursive: true });
    const project = await core.api.projects.add(projectDir);
    await core.api.items.create(
      { kind: "command", name: "commit" },
      "---\ndescription: Commit\n---\nCommit $ARGUMENTS\n",
    );
    await core.api.items.deploy(
      { kind: "command", name: "commit" },
      { agentKey: "gemini_cli", projectId: project.id },
    );
    const toml = readFileSync(join(projectDir, ".gemini", "commands", "commit.toml"), "utf8");
    expect(parseTomlStrings(toml)).toEqual({ description: "Commit", prompt: "Commit {{args}}" });
    await expect(
      core.api.items.deploy(
        { kind: "command", name: "commit" },
        { agentKey: "cursor", projectId: null },
      ),
    ).rejects.toMatchObject({ code: "UNSUPPORTED" });
  });

  it("stops managing a project's items once the project is unlinked, and leaves its files", async () => {
    const projectDir = join(temp.dir, "app");
    mkdirSync(projectDir, { recursive: true });
    const project = await core.api.projects.add(projectDir);
    const commit = { kind: "command", name: "commit" } as const;
    await core.api.items.create(commit, "---\ndescription: Commit\n---\nCommit $ARGUMENTS\n");
    await core.api.items.deploy(commit, { agentKey: "gemini_cli", projectId: project.id });
    const file = join(projectDir, ".gemini", "commands", "commit.toml");

    await core.api.projects.remove(project.id);

    const [listed] = await core.api.items.list("command");
    expect(listed?.deployments).toEqual([]);
    expect(existsSync(file)).toBe(true);
  });
});

describe("finding and importing items", () => {
  it("finds items in agent folders, but not the ones it deployed", async () => {
    write(
      join(home, ".config", "opencode", "commands", "git", "commit.md"),
      "---\ndescription: Commit\n---\nCommit $ARGUMENTS\n",
    );
    write(
      join(home, ".claude", "agents", "helper.md"),
      "---\nname: helper\ndescription: Helps.\n---\nHelp.\n",
    );
    await core.api.items.create(REVIEWER, "---\ndescription: R\n---\nR\n");
    await core.api.items.deploy(REVIEWER, CLAUDE);

    const found = await core.api.items.find({ type: "agents" });
    expect(found.map((item) => `${item.kind}/${item.name}/${item.agentKey}`)).toEqual([
      "subagent/helper/claude_code",
      "command/git-commit/opencode",
    ]);
    expect(found[0]?.status).toBe("new");

    const result = await core.api.items.importItems(found);
    expect(result.imported).toHaveLength(2);
    const again = await core.api.items.find({ type: "agents" });
    expect(again.map((item) => item.status)).toEqual(["same", "same"]);
    const skipped = await core.api.items.importItems(found);
    expect(skipped.skipped).toHaveLength(2);
  });

  it("finds items in a repository layout, converting agent formats", async () => {
    const repo = join(temp.dir, "repo");
    write(join(repo, "agents", "planner.md"), "---\ndescription: Plans.\n---\nPlan.\n");
    write(join(repo, "agents", "README.md"), "# About these agents\n");
    write(
      join(repo, ".claude", "agents", "cl", "locator.md"),
      "---\ndescription: Finds.\n---\nFind.\n",
    );
    write(join(repo, "docs", "rules", "notes.md"), "Just notes, not a rule.\n");
    write(
      join(repo, ".cursor", "rules", "ts.mdc"),
      "---\ndescription: TS\nglobs: src/**/*.ts\nalwaysApply: false\n---\nUse strict.\n",
    );
    write(
      join(repo, ".gemini", "commands", "review.toml"),
      'description = "Review"\nprompt = "Review {{args}}"\n',
    );
    const found = await core.api.items.find({ type: "folder", path: repo });
    expect(found.map((item) => `${item.kind}/${item.name}@${item.path}`)).toEqual([
      "subagent/cl-locator@.claude/agents/cl/locator.md",
      "subagent/planner@agents/planner.md",
      "command/review@.gemini/commands/review.toml",
      "rule/ts@.cursor/rules/ts.mdc",
    ]);
    const rule = found.find((item) => item.kind === "rule");
    expect(parseMarkdown(rule?.content ?? "").fields).toEqual({
      description: "TS",
      paths: ["src/**/*.ts"],
    });
  });
});
