import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Skill, SourceSearch } from "@loadout/shared";
import { afterEach, beforeEach, expect, it } from "vitest";
import { type Sandbox, createSandbox, writeSkill } from "./harness";

let box: Sandbox;
let repo: string;
const saved = { ...process.env };
const LINK = "See https://github.com/acme/skills for updates.\n";

const git = (...args: string[]): string =>
  execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();

beforeEach(() => {
  // The marketplace is never reached in these tests.
  box = createSandbox({ fetchImpl: async () => Promise.reject(new Error("offline")) });
  const remotes = join(box.root, "remotes");
  repo = join(remotes, "acme", "skills.git");
  mkdirSync(repo, { recursive: true });
  // `https://github.com/…` is served from the folder above.
  Object.assign(process.env, {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: `url.${remotes}/.insteadOf`,
    GIT_CONFIG_VALUE_0: "https://github.com/",
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.invalid",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.invalid",
  });
  git("init", "--quiet", "--initial-branch=main");
  writeSkill(join(repo, "skills"), "pdf", LINK);
  writeSkill(join(repo, "skills"), "draft", "# draft upstream\n");
  git("add", "--all");
  git("commit", "--quiet", "-m", "skills");
});

afterEach(() => {
  process.env = { ...saved };
  box.cleanup();
});

/** Install a copy of the repository's skill from a plain folder: it has no source then. */
async function installCopy(name: string, body?: string): Promise<void> {
  const folder = join(box.root, "copies", name);
  if (body === undefined) cpSync(join(repo, "skills", name), folder, { recursive: true });
  else writeSkill(join(box.root, "copies"), name, body);
  expect((await box.cli("skills", "install", folder)).code).toBe(0);
}

it("finds the repository a skill links to and links it", async () => {
  await installCopy("pdf");
  const found = (await box.cli("sources", "find", "--json")).json<SourceSearch[]>();
  expect(found).toHaveLength(1);
  expect(found[0]?.candidates[0]).toMatchObject({
    label: "acme/skills",
    subpath: "skills/pdf",
    match: "identical",
  });
  expect(found[0]?.failures).toEqual([expect.stringContaining("offline")]);

  const linked = await box.cli("sources", "link", "pdf");
  expect(linked.code).toBe(0);
  expect(linked.stdout).toContain("pdf now follows acme/skills/skills/pdf.");
  const list = await box.cli("sources", "list");
  expect(list.stdout).toMatch(/acme\/skills\s+repository\s+1/);
});

it("links a copy that differs only with --yes", async () => {
  await installCopy("draft", "# my own draft\n");
  const refused = await box.cli("sources", "link", "draft", "acme/skills");
  expect(refused.code).not.toBe(0);
  expect(refused.stderr).toContain(
    "draft is not the same as acme/skills/skills/draft: 80% alike (SKILL.md)",
  );

  const linked = await box.cli("sources", "link", "draft", "acme/skills", "--yes", "--json");
  expect(linked.json<{ skill: Skill }>().skill).toMatchObject({
    sourceType: "git",
    sourceRevision: null,
    updateStatus: "update_available",
  });
});

it("marks a skill as the user's own and takes it back", async () => {
  await box.cli("skills", "install", writeSkill(box.root, "notes"));
  expect((await box.cli("sources", "mine", "notes")).stdout).toContain("Marked as yours: notes.");
  const none = (await box.cli("sources", "find", "--json")).json<SourceSearch[]>();
  expect(none).toEqual([]);
  const undone = await box.cli("sources", "mine", "notes", "--undo");
  expect(undone.stdout).toContain("No longer marked as yours: notes.");
});
