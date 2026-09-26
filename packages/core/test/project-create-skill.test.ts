import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeSkill, writeFile } from "./helpers";
import { type WorkspaceWorld, createWorkspaceWorld, rejection } from "./workspace-world";

const INPUT = { name: "code-review", description: "Review a diff before it is merged." };

describe("create a skill in a project", () => {
  let world: WorkspaceWorld;
  let repo: string;
  let claude: string;
  let cursor: string;
  const api = () => world.projects.api;

  beforeEach(() => {
    world = createWorkspaceWorld();
    world.installAgents(".claude", ".cursor", ".warp");
    repo = join(world.root, "work", "repo");
    mkdirSync(repo, { recursive: true });
    claude = join(repo, ".claude", "skills");
    cursor = join(repo, ".cursor", "skills");
  });
  afterEach(() => world.cleanup());

  it("writes the new document into each chosen agent's folder, never the library", async () => {
    const project = await api().add(repo);
    const ref = await api().createSkill(project.id, INPUT, ["claude_code", "cursor"]);

    expect(ref).toEqual({ relativePath: "code-review", agentKey: "claude_code" });
    const document = readFileSync(join(claude, "code-review", "SKILL.md"), "utf8");
    expect(document).toContain("name: code-review");
    expect(document).toContain("description: Review a diff before it is merged.");
    expect(readFileSync(join(cursor, "code-review", "SKILL.md"), "utf8")).toBe(document);
    expect(world.store.list()).toEqual([]);
    const listed = (await api().skills(project.id)).map((s) => [s.agentKey, s.syncStatus]);
    expect(listed).toEqual([
      ["claude_code", "local_only"],
      ["cursor", "local_only"],
    ]);
  });

  it("uses the default agent when none is chosen and trims what was typed", async () => {
    const project = await api().add(repo);
    await api().createSkill(project.id, { name: " notes ", description: " Keep notes. " });
    expect(readFileSync(join(claude, "notes", "SKILL.md"), "utf8")).toContain(
      "description: Keep notes.",
    );
    expect(existsSync(cursor)).toBe(false);
  });

  it("writes nothing when any chosen folder has the name, in any case or switched off", async () => {
    const project = await api().add(repo);
    makeSkill(`${cursor}-disabled`, "Code-Review", { body: "parked" });
    const error = await rejection(api().createSkill(project.id, INPUT, ["claude_code", "cursor"]));
    expect(error.code).toBe("ALREADY_EXISTS");
    expect(error.message).toBe("Cursor already has a skill named code-review in this project");
    expect(existsSync(join(claude, "code-review"))).toBe(false);
  });

  it("refuses a bad name, an empty description and agents that cannot be used", async () => {
    const project = await api().add(repo);
    const badName = await rejection(api().createSkill(project.id, { ...INPUT, name: "Bad Name" }));
    expect(badName.code).toBe("INVALID_INPUT");
    const noDescription = await rejection(
      api().createSkill(project.id, { ...INPUT, description: "  " }),
    );
    expect(noDescription.code).toBe("INVALID_INPUT");
    const noAgent = await rejection(api().createSkill(project.id, INPUT, ["gemini_cli"]));
    expect(noAgent.message).toBe("No enabled installed agents selected for this project");
    expect(existsSync(join(claude, "code-review"))).toBe(false);
  });

  it("takes back what it wrote when a later folder cannot be written", async () => {
    const project = await api().add(repo);
    // A file where Cursor's skills folder should be: the second write fails.
    writeFile(cursor, "not a folder");
    await expect(api().createSkill(project.id, INPUT, ["claude_code", "cursor"])).rejects.toThrow(
      "ENOTDIR",
    );
    expect(existsSync(join(claude, "code-review"))).toBe(false);
  });
});
