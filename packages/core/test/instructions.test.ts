import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { InstructionFile, SkillLocation } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type EditorService, createEditorService, createFileHistory } from "../src/editor";
import {
  type InstructionsService,
  createInstructionFinder,
  createInstructionsService,
} from "../src/instructions";
import { writeFile } from "./helpers";
import { type WorkspaceWorld, createWorkspaceWorld, rejection } from "./workspace-world";

let world: WorkspaceWorld;
let instructions: InstructionsService;
let editor: EditorService;

beforeEach(() => {
  world = createWorkspaceWorld();
  // Wired as `createCore` wires them.
  const finder = createInstructionFinder({
    registry: world.registry,
    projects: world.projects.projects,
  });
  instructions = createInstructionsService(world.ctx, { finder });
  editor = createEditorService(world.ctx, {
    store: world.store,
    registry: world.registry,
    projects: world.projects.projects,
    instructions: finder,
    history: createFileHistory(world.ctx.paths.historyDir),
    refreshCopies: async () => ({ written: 0, kept: [] }),
  });
});
afterEach(() => world.cleanup());

const globalOf = (agentKey: string): SkillLocation => ({
  kind: "instructions",
  agentKey,
  projectId: null,
});
const readerKeys = (file: InstructionFile | undefined): string[] =>
  file?.readers.map((reader) => reader.agentKey) ?? [];
const byName = (files: InstructionFile[], name: string): InstructionFile | undefined =>
  files.find((file) => file.name === name);

async function newProject(): Promise<{ id: string; path: string }> {
  const path = join(world.root, "app");
  mkdirSync(path, { recursive: true });
  const project = await world.projects.api.add(path);
  return { id: project.id, path };
}

describe("listing", () => {
  it("lists the global file of each available agent, found or not", async () => {
    world.installAgents(".claude", ".codex");
    writeFile(join(world.home, ".claude/CLAUDE.md"), "# Mine\n");

    const files = await instructions.api.list(null);

    const claude = byName(files, "CLAUDE.md");
    expect(claude).toMatchObject({ scope: "global", exists: true, size: 7, projectId: null });
    expect(claude?.path).toBe(join(world.home, ".claude/CLAUDE.md"));
    expect(byName(files, "AGENTS.md")).toMatchObject({ exists: false, size: null });
    // Agents that are not installed are left out.
    expect(files.flatMap(readerKeys)).not.toContain("gemini_cli");
  });

  it("merges agents that read the same project file", async () => {
    world.installAgents(".claude", ".codex", ".cursor");
    const project = await newProject();

    const files = await instructions.api.list(project.id);

    expect(readerKeys(byName(files, "AGENTS.md"))).toEqual(
      expect.arrayContaining(["codex", "cursor"]),
    );
    expect(byName(files, "AGENTS.md")?.path).toBe(join(project.path, "AGENTS.md"));
    expect(readerKeys(byName(files, "CLAUDE.md"))).toEqual(["claude_code"]);
  });

  it("treats a file linked to another as that file", async () => {
    world.installAgents(".claude", ".codex");
    const project = await newProject();
    writeFileSync(join(project.path, "AGENTS.md"), "shared\n");
    symlinkSync("AGENTS.md", join(project.path, "CLAUDE.md"));

    const files = await instructions.api.list(project.id);

    expect(files).toHaveLength(1);
    expect(readerKeys(files[0])).toEqual(expect.arrayContaining(["claude_code", "codex"]));
  });

  it("has nothing for a linked workspace", async () => {
    const path = join(world.root, "linked");
    mkdirSync(path, { recursive: true });
    const linked = await world.projects.api.addLinked("Linked", path);
    const error = await rejection(instructions.api.list(linked.id));
    expect(error.code).toBe("UNSUPPORTED");
  });
});

describe("creating", () => {
  it("creates a missing global file with its folders", async () => {
    world.installAgents(".gemini");
    const file = await instructions.api.create(globalOf("gemini_cli"));
    expect(file.exists).toBe(true);
    expect(readFileSync(join(world.home, ".gemini/GEMINI.md"), "utf8")).toBe("");
  });

  it("leaves an existing file alone", async () => {
    world.installAgents(".claude");
    writeFile(join(world.home, ".claude/CLAUDE.md"), "keep\n");
    await instructions.api.create(globalOf("claude_code"));
    expect(readFileSync(join(world.home, ".claude/CLAUDE.md"), "utf8")).toBe("keep\n");
  });

  it("refuses an agent without a file for that place", async () => {
    world.installAgents(".cursor");
    const error = await rejection(instructions.api.create(globalOf("cursor")));
    expect(error.code).toBe("NOT_FOUND");
  });

  it("does not bring back a deleted project folder", async () => {
    world.installAgents(".claude");
    const project = await newProject();
    rmSync(project.path, { recursive: true, force: true });
    const location: SkillLocation = {
      kind: "instructions",
      agentKey: "claude_code",
      projectId: project.id,
    };
    const error = await rejection(instructions.api.create(location));
    expect(error.code).toBe("NOT_FOUND");
    expect(existsSync(project.path)).toBe(false);
  });
});

describe("editing", () => {
  it("opens only the instruction file of its folder", async () => {
    world.installAgents(".claude");
    writeFile(join(world.home, ".claude/CLAUDE.md"), "# Rules\n");
    writeFile(join(world.home, ".claude/settings.json"), "{}\n");
    const location = globalOf("claude_code");

    const files = await editor.api.files(location);
    expect(files.map((file) => file.path)).toEqual(["CLAUDE.md"]);
    const error = await rejection(editor.api.readFile(location, "settings.json"));
    expect(error.code).toBe("INVALID_INPUT");
    const target = await editor.api.target(location);
    expect(target).toMatchObject({ name: "CLAUDE.md", placeLabel: "Claude Code" });
  });

  it("saves, keeps the old version and refuses a stale save", async () => {
    world.installAgents(".codex");
    writeFile(join(world.home, ".codex/AGENTS.md"), "one\n");
    const location = globalOf("codex");
    const opened = await editor.api.readFile(location, "AGENTS.md");

    const saved = await editor.api.saveFile(location, {
      path: "AGENTS.md",
      content: "two\n",
      baseHash: opened.hash,
    });
    expect(saved.written).toBe(true);
    expect(readFileSync(join(world.home, ".codex/AGENTS.md"), "utf8")).toBe("two\n");
    expect(await editor.api.fileVersions(location, "AGENTS.md")).toHaveLength(1);

    const stale = editor.api.saveFile(location, {
      path: "AGENTS.md",
      content: "three\n",
      baseHash: opened.hash,
    });
    expect((await rejection(stale)).code).toBe("CHANGED_ON_DISK");
  });

  it("writes through a link to the file it leads to", async () => {
    world.installAgents(".claude", ".codex");
    const project = await newProject();
    writeFileSync(join(project.path, "AGENTS.md"), "shared\n");
    symlinkSync("AGENTS.md", join(project.path, "CLAUDE.md"));
    const location: SkillLocation = {
      kind: "instructions",
      agentKey: "claude_code",
      projectId: project.id,
    };
    const opened = await editor.api.readFile(location, "AGENTS.md");
    await editor.api.saveFile(location, {
      path: "AGENTS.md",
      content: "changed\n",
      baseHash: opened.hash,
    });
    expect(readFileSync(join(project.path, "CLAUDE.md"), "utf8")).toBe("changed\n");
  });

  it("reports a missing file as not found", async () => {
    world.installAgents(".claude");
    const error = await rejection(editor.api.target(globalOf("claude_code")));
    expect(error.code).toBe("NOT_FOUND");
  });
});
