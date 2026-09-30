import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PublishPlan, PublishResult } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_FAILED, EXIT_OK, EXIT_USAGE } from "../src/run";
import { type Sandbox, createSandbox, writeSkill } from "./harness";

// Built at run time, so this file never holds anything that looks like a real token.
const TOKEN = `ghp_${"a1B2c3D4e5".repeat(4)}`;

let sandbox: Sandbox;
let remote: string;
const saved = { global: process.env.GIT_CONFIG_GLOBAL, system: process.env.GIT_CONFIG_NOSYSTEM };

const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

async function install(name: string, body?: string): Promise<void> {
  writeSkill(join(sandbox.root, "src"), name, body);
  expect((await sandbox.cli("skills", "install", join(sandbox.root, "src", name))).code).toBe(
    EXIT_OK,
  );
}

beforeEach(async () => {
  sandbox = createSandbox();
  const config = join(sandbox.root, "gitconfig");
  writeFileSync(config, "[user]\n\tname = Ada\n\temail = ada@example.test\n");
  process.env.GIT_CONFIG_GLOBAL = config;
  process.env.GIT_CONFIG_NOSYSTEM = "1";
  remote = join(sandbox.root, "remote.git");
  mkdirSync(remote);
  git(remote, "init", "-q", "--bare", "--initial-branch=main");
  await install("pdf");
  await install("docx");
});

afterEach(() => {
  for (const [key, value] of [
    ["GIT_CONFIG_GLOBAL", saved.global],
    ["GIT_CONFIG_NOSYSTEM", saved.system],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  sandbox.cleanup();
});

describe("skills publish", () => {
  it("needs --yes, and a dry run shows the plan and changes nothing", async () => {
    const refused = await sandbox.cli("skills", "publish", "pdf", "--repo", remote);
    expect(refused.code).toBe(EXIT_USAGE);
    expect(refused.stderr).toContain("--yes");

    const dry = await sandbox.cli("skills", "publish", "pdf", "--repo", remote, "--dry-run");
    expect(dry.code).toBe(EXIT_OK);
    expect(dry.stdout).toContain("pdf");
    expect(dry.stdout).toContain("new");
    expect(dry.stdout).toContain("Nothing was changed.");
    expect(git(remote, "branch", "--list")).toBe("");
    const plan = (
      await sandbox.cli("skills", "publish", "pdf", "--repo", remote, "--dry-run", "--json")
    ).json<PublishPlan>();
    expect(plan.skills[0]).toMatchObject({ name: "pdf", status: "new" });
  });

  it("publishes, remembers the repository, and says nothing changed the second time", async () => {
    const run = await sandbox.cli("skills", "publish", "pdf", "docx", "--repo", remote, "--yes");
    expect(run.code).toBe(EXIT_OK);
    expect(run.stdout).toContain("Published pdf, docx");
    expect(git(remote, "show", "main:skills/pdf/SKILL.md")).toContain("name: pdf");
    expect(git(remote, "log", "-1", "--format=%an")).toBe("Ada");

    // No --repo: the last one is used.
    const again = await sandbox.cli("skills", "publish", "--all", "--yes", "--json");
    expect(again.code).toBe(EXIT_OK);
    const result = again.json<PublishResult>();
    expect(result.commit).toBeNull();
    expect(result.unchanged.sort()).toEqual(["docx", "pdf"]);
  });

  it("puts skills in the chosen layer", async () => {
    const run = await sandbox.cli(
      "skills",
      "publish",
      "pdf",
      "--repo",
      remote,
      "--layer",
      "curated",
      "--yes",
    );
    expect(run.code).toBe(EXIT_OK);
    expect(git(remote, "show", "main:skills/.curated/pdf/SKILL.md")).toContain("name: pdf");
    const bad = await sandbox.cli(
      "skills",
      "publish",
      "pdf",
      "--repo",
      remote,
      "--layer",
      "x",
      "--yes",
    );
    expect(bad.code).toBe(EXIT_USAGE);
  });

  it("holds back a token and publishes with --allow-secrets", async () => {
    await install("leaky", `Call it with ${TOKEN}.\n`);
    const held = await sandbox.cli("skills", "publish", "leaky", "--repo", remote, "--yes");
    expect(held.code).toBe(EXIT_FAILED);
    expect(held.stderr).toContain("Error (SECRETS_FOUND)");
    expect(held.stderr).toContain("skills/leaky/SKILL.md:");
    expect(held.stderr).toContain("--allow-secrets");
    expect(held.stderr).not.toContain(TOKEN);
    expect(git(remote, "branch", "--list")).toBe("");

    const done = await sandbox.cli(
      "skills",
      "publish",
      "leaky",
      "--repo",
      remote,
      "--yes",
      "--allow-secrets",
    );
    expect(done.code).toBe(EXIT_OK);
  });

  it("asks for skills and a repository", async () => {
    expect((await sandbox.cli("skills", "publish", "--repo", remote, "--yes")).code).toBe(
      EXIT_USAGE,
    );
    const noRepo = await sandbox.cli("skills", "publish", "pdf", "--yes");
    expect(noRepo.code).toBe(EXIT_USAGE);
    expect(noRepo.stderr).toContain("--repo");
    expect(existsSync(join(remote, "refs", "heads", "main"))).toBe(false);
  });
});
