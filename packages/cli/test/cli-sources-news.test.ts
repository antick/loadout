import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { SourceCheckResult } from "@loadout/shared";
import { afterEach, beforeEach, expect, it } from "vitest";
import { redirectGithubTo } from "../../core/test/git-env";
import { type Sandbox, createSandbox, writeSkill } from "./harness";

let box: Sandbox;
let repo: string;
let restoreEnv: () => void;

const git = (...args: string[]): string =>
  execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();

function publish(name: string): void {
  writeSkill(join(repo, "skills"), name);
  git("add", "--all");
  git("commit", "--quiet", "-m", `add ${name}`);
}

beforeEach(() => {
  box = createSandbox();
  const remotes = join(box.root, "remotes");
  repo = join(remotes, "acme", "skills.git");
  mkdirSync(repo, { recursive: true });
  // `https://github.com/…` is served from the folder above.
  restoreEnv = redirectGithubTo(remotes);
  git("init", "--quiet", "--initial-branch=main");
  publish("pdf");
  publish("docx");
});

afterEach(() => {
  restoreEnv();
  box.cleanup();
});

it("finds skills a repository gained, lists them, and dismisses them", async () => {
  expect((await box.cli("skills", "install", "acme/skills", "--skill", "pdf")).code).toBe(0);
  const first = await box.cli("sources", "check", "--json");
  expect(first.json<SourceCheckResult>()).toMatchObject({ news: [], added: [], failed: [] });

  publish("xlsx");
  const second = await box.cli("sources", "check", "acme/skills");
  expect(second.code).toBe(0);
  expect(second.stdout).toContain("xlsx");
  expect(second.stdout).toContain("skills/xlsx");
  expect((await box.cli("sources", "list")).stdout).toMatch(
    /acme\/skills\s+repository\s+1\s+0\s+1/,
  );

  const dismissed = await box.cli("sources", "dismiss", "acme/skills");
  expect(dismissed.stdout).toContain("No longer showing 1 new skill of acme/skills.");
  expect((await box.cli("sources", "check", "--json")).json<SourceCheckResult>().news).toEqual([]);

  const unknown = await box.cli("sources", "dismiss", "nobody/nothing");
  expect(unknown.code).not.toBe(0);
  expect(unknown.stderr).toContain("No repository called");
});

it("exits 1 and does not claim nothing is new when a source cannot be checked", async () => {
  expect((await box.cli("skills", "install", "acme/skills", "--skill", "pdf")).code).toBe(0);
  rmSync(repo, { recursive: true, force: true });

  const run = await box.cli("sources", "check");
  expect(run.code).toBe(1);
  expect(run.stdout).toContain("Could not check github.com/acme/skills");
  expect(run.stdout).not.toContain("Nothing new in these sources.");

  const json = await box.cli("sources", "check", "--json");
  expect(json.code).toBe(1);
  expect(json.json<SourceCheckResult>().failed).toMatchObject([{ name: "github.com/acme/skills" }]);
});
