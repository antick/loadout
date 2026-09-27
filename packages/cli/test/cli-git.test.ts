import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_FAILED, EXIT_OK } from "../src/run";
import { type Sandbox, createSandbox, writeSkill } from "./harness";

// Built at run time, so this file never holds anything that looks like a real token.
const TOKEN = `ghp_${"a1B2c3D4e5".repeat(4)}`;

let sandbox: Sandbox;
const previousConfig = process.env.GIT_CONFIG_GLOBAL;

beforeEach(() => {
  sandbox = createSandbox();
  const config = join(sandbox.root, "gitconfig");
  writeFileSync(config, "");
  process.env.GIT_CONFIG_GLOBAL = config;
  process.env.GIT_CONFIG_NOSYSTEM = "1";
});

afterEach(() => {
  if (previousConfig === undefined) delete process.env.GIT_CONFIG_GLOBAL;
  else process.env.GIT_CONFIG_GLOBAL = previousConfig;
  sandbox.cleanup();
});

describe("git sync", () => {
  it("holds back a token, lists it, and pushes with --allow-secrets", async () => {
    const remote = join(sandbox.root, "remote.git");
    mkdirSync(remote);
    execFileSync("git", ["init", "-q", "--bare"], { cwd: remote });
    expect((await sandbox.cli("git", "init")).code).toBe(EXIT_OK);
    expect((await sandbox.cli("git", "remote", remote)).code).toBe(EXIT_OK);
    writeSkill(join(sandbox.root, "src"), "leaky", `Call it with ${TOKEN}.\n`);
    expect((await sandbox.cli("skills", "install", join(sandbox.root, "src", "leaky"))).code).toBe(
      EXIT_OK,
    );

    const held = await sandbox.cli("git", "sync");
    expect(held.code).toBe(EXIT_FAILED);
    expect(held.stderr).toContain("Error (SECRETS_FOUND)");
    expect(held.stderr).toContain("leaky/SKILL.md:");
    expect(held.stderr).toContain("--allow-secrets");
    expect(held.stderr).not.toContain(TOKEN);

    const pushed = await sandbox.cli("git", "sync", "--allow-secrets");
    expect(pushed.code).toBe(EXIT_OK);
    expect(pushed.stdout).toContain("Pushed");
  });
});
