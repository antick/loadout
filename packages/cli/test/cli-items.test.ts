import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { LIBRARY_DIR_NAME } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_FAILED, EXIT_OK, EXIT_USAGE } from "../src/run";
import { type Run, type Sandbox, createSandbox } from "./harness";

/** `items`: subagents, commands and rules from the command line. */

let sandbox: Sandbox;
const cli = (...argv: string[]): Promise<Run> => sandbox.cli(...argv);

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

const REVIEWER = "---\ndescription: Reviews code.\ntools: Read, Grep\n---\n\nReview it.\n";

beforeEach(() => {
  sandbox = createSandbox();
});

afterEach(() => sandbox.cleanup());

describe("items", () => {
  it("imports from a folder, deploys converted, shows and removes", async () => {
    const repo = join(sandbox.root, "repo");
    write(join(repo, "agents", "reviewer.md"), REVIEWER);
    mkdirSync(join(sandbox.home, ".gemini"), { recursive: true });

    const find = await cli("items", "find", "./repo", "--json");
    expect(find.json<{ name: string; status: string }[]>()).toMatchObject([
      { name: "reviewer", status: "new" },
    ]);
    expect((await cli("items", "import", "./repo")).code).toBe(EXIT_USAGE);
    const imported = await cli("items", "import", "./repo", "--all");
    expect(imported.stdout).toContain("Imported 1 item");

    const deployed = await cli(
      "items",
      "deploy",
      "reviewer",
      "-a",
      "claude_code",
      "-a",
      "gemini_cli",
    );
    expect(deployed.code).toBe(EXIT_OK);
    expect(deployed.stdout).toContain("note: The tool list (Read, Grep) is left out");
    const gemini = join(sandbox.home, ".gemini", "agents", "reviewer.md");
    expect(readFileSync(gemini, "utf8")).toContain("name: reviewer");

    const shown = await cli("items", "show", "subagent/reviewer", "--agent", "gemini_cli");
    expect(shown.stdout).toContain(gemini);
    const listed = await cli("items", "list", "--kind", "subagent");
    expect(listed.stdout).toContain("claude_code, gemini_cli");

    expect((await cli("items", "remove", "reviewer")).code).toBe(EXIT_USAGE);
    const dry = await cli("items", "remove", "reviewer", "--dry-run");
    expect(dry.stdout).toContain("2 deployed files");
    expect(existsSync(gemini)).toBe(true);
    expect((await cli("items", "remove", "reviewer", "--yes")).code).toBe(EXIT_OK);
    expect(existsSync(gemini)).toBe(false);
  });

  it("refuses a file it did not write and says why, per agent", async () => {
    await cli("items", "create", "command/commit");
    write(join(sandbox.home, ".claude", "commands", "commit.md"), "mine\n");
    const run = await cli("items", "deploy", "command/commit", "-a", "claude_code");
    expect(run.code).toBe(EXIT_FAILED);
    expect(run.stdout).toContain("was not written by Loadout");
    expect(readFileSync(join(sandbox.home, ".claude", "commands", "commit.md"), "utf8")).toBe(
      "mine\n",
    );
  });

  it("deploys into a project folder, linking it", async () => {
    const project = join(sandbox.root, "app");
    mkdirSync(project, { recursive: true });
    await cli("items", "create", "rule/style");
    const run = await cli("items", "deploy", "rule/style", "-a", "cursor", "--project", "./app");
    expect(run.stdout).toContain("Linked");
    expect(existsSync(join(project, ".cursor", "rules", "style.mdc"))).toBe(true);
  });

  it("converts a file without a library", async () => {
    write(join(sandbox.root, "reviewer.md"), REVIEWER);
    const run = await cli(
      "items",
      "convert",
      "./reviewer.md",
      "--kind",
      "subagent",
      "--to",
      "opencode",
    );
    expect(run.code).toBe(EXIT_OK);
    expect(run.stdout).toContain("mode: subagent");
    expect(existsSync(join(sandbox.home, LIBRARY_DIR_NAME))).toBe(false);
  });
});
