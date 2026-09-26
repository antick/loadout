import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type SuggestProjectsInput, suggestProjects } from "../src/projects/suggest";

let home: string;
let configDir: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "loadout-suggest-"));
  configDir = join(home, ".config");
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

const SKILL_FOLDERS = [".claude/skills", ".agents/skills"];

function input(patch: Partial<SuggestProjectsInput> = {}): SuggestProjectsInput {
  return {
    homeDir: home,
    configDir,
    platform: "linux",
    skillFolders: SKILL_FOLDERS,
    exclude: [],
    ...patch,
  };
}

function folder(...parts: string[]): string {
  const path = join(home, ...parts);
  mkdirSync(path, { recursive: true });
  return path;
}

function gitRepo(...parts: string[]): string {
  const path = folder(...parts);
  mkdirSync(join(path, ".git"), { recursive: true });
  writeFileSync(join(path, ".git", "HEAD"), "ref: refs/heads/main\n");
  return path;
}

function touch(path: string, ms: number): void {
  utimesSync(path, ms / 1000, ms / 1000);
}

function claudeKnows(paths: string[]): void {
  const projects = Object.fromEntries(paths.map((path) => [path, { allowedTools: [] }]));
  writeFileSync(join(home, ".claude.json"), JSON.stringify({ projects }));
}

function editorKnows(appDir: string, paths: string[]): void {
  const dir = join(configDir, appDir, "User", "globalStorage");
  mkdirSync(dir, { recursive: true });
  const uris = paths.map((path) => pathToFileURL(path).href);
  writeFileSync(
    join(dir, "storage.json"),
    JSON.stringify({ backupWorkspaces: { folders: uris.map((folderUri) => ({ folderUri })) } }),
  );
}

describe("project suggestions", () => {
  it("merges Claude Code, the editors and Git repositories, most recent first", async () => {
    const app = gitRepo("Projects", "personal", "app");
    const api = gitRepo("code", "api");
    const notes = folder("notes");
    folder("app", ".claude", "skills");
    folder("Projects", "personal", "app", ".agents", "skills");
    claudeKnows([app, notes]);
    editorKnows("Cursor", [app, join(home, "setup.code-workspace")]);
    editorKnows("Code", [api]);
    touch(join(api, ".git", "HEAD"), Date.UTC(2026, 0, 2));
    touch(join(app, ".git", "HEAD"), Date.UTC(2026, 0, 1));
    const sessions = folder(".claude", "projects", app.replace(/[^a-zA-Z0-9]/g, "-"));
    touch(sessions, Date.UTC(2026, 0, 3));

    const suggestions = suggestProjects(input());
    expect(suggestions.map((s) => [s.name, s.sources])).toEqual([
      ["app", ["claude_code", "cursor", "git"]],
      ["api", ["vscode", "git"]],
      ["notes", ["claude_code"]],
    ]);
    expect(suggestions[0]).toMatchObject({
      path: app,
      lastActiveAt: Date.UTC(2026, 0, 3),
      skillFolders: [".agents/skills"],
      guarded: false,
    });
    expect(suggestions[1]?.lastActiveAt).toBe(Date.UTC(2026, 0, 2));
    expect(suggestions[2]?.lastActiveAt).toBeNull();
  });

  it("leaves out linked projects, the library, containers and folders that are gone", async () => {
    const linked = gitRepo("Projects", "linked");
    const inside = gitRepo("Projects", "linked", "packages", "inner");
    const library = folder(".loadout");
    claudeKnows([linked, inside, library, home, join(home, "Projects"), join(home, "gone")]);

    expect(suggestProjects(input({ exclude: [linked, library] }))).toEqual([]);
  });

  it("does not look inside folders macOS guards, but still lists them", async () => {
    const guarded = join(home, "Documents", "thesis");
    const open = gitRepo("Projects", "tool");
    claudeKnows([guarded, open]);
    // The guarded folder is never created: listing it must not need it on disk.
    const suggestions = suggestProjects(input({ platform: "darwin" }));
    expect(suggestions.find((s) => s.name === "thesis")).toMatchObject({
      path: guarded,
      guarded: true,
      skillFolders: [],
    });
    expect(suggestions.find((s) => s.name === "tool")?.guarded).toBe(false);
    // Elsewhere nothing is guarded, so a folder that does not exist is dropped.
    expect(suggestProjects(input()).map((s) => s.name)).toEqual(["tool"]);
  });

  it("stops at two levels below the code folders and skips dependency folders", async () => {
    gitRepo("Projects", "a", "b");
    gitRepo("Projects", "a", "b2", "too-deep");
    gitRepo("Projects", "node_modules", "dep");
    expect(suggestProjects(input()).map((s) => s.name)).toEqual(["b"]);
  });

  it("copes with missing and broken history files", async () => {
    writeFileSync(join(home, ".claude.json"), "{ not json");
    mkdirSync(join(configDir, "Cursor", "User", "globalStorage"), { recursive: true });
    writeFileSync(join(configDir, "Cursor", "User", "globalStorage", "storage.json"), "file://%%");
    expect(suggestProjects(input())).toEqual([]);
  });
});
