import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_FAILED, EXIT_OK } from "../src/run";
import { type Sandbox, createSandbox, writeSkill } from "./harness";

// Built at run time, so this file never holds anything that looks like a real token.
const TOKEN = `ghp_${"a1B2c3D4e5".repeat(4)}`;

let sandbox: Sandbox;

beforeEach(() => {
  sandbox = createSandbox();
});

afterEach(() => {
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

    // The dry run refuses what the real run refuses.
    const dry = await sandbox.cli("git", "sync", "--dry-run");
    expect(dry.code).toBe(EXIT_FAILED);
    expect(dry.stderr).toContain("Error (SECRETS_FOUND)");
    expect((await sandbox.cli("git", "sync", "--dry-run", "--allow-secrets")).code).toBe(EXIT_OK);

    const held = await sandbox.cli("git", "sync");
    expect(held.code).toBe(EXIT_FAILED);
    expect(held.stderr).toContain("Error (SECRETS_FOUND)");
    expect(held.stderr).toContain("leaky/SKILL.md:");
    expect(held.stderr).toContain("--allow-secrets");
    expect(held.stderr).not.toContain(TOKEN);

    const pushed = await sandbox.cli("git", "sync", "--allow-secrets");
    expect(pushed.code).toBe(EXIT_OK);
    expect(pushed.stdout).toContain("Pushed");

    // The go-ahead was for that one sync: a new key stops the next one again.
    writeSkill(join(sandbox.root, "src"), "leaky2", `Also ${TOKEN}.\n`);
    await sandbox.cli("skills", "install", join(sandbox.root, "src", "leaky2"));
    const again = await sandbox.cli("git", "sync");
    expect(again.code).toBe(EXIT_FAILED);
    expect(again.stderr).toContain("leaky2/SKILL.md:");
    expect(again.stderr).not.toContain("leaky/SKILL.md:");
  });

  it("--allow-secrets on a sync that stops for another reason remembers nothing", async () => {
    expect((await sandbox.cli("git", "init")).code).toBe(EXIT_OK);
    // A remote that does not exist: the sync fails after the key would have been allowed.
    expect((await sandbox.cli("git", "remote", join(sandbox.root, "nowhere.git"))).code).toBe(
      EXIT_OK,
    );
    writeSkill(join(sandbox.root, "src"), "leaky", `Call it with ${TOKEN}.\n`);
    await sandbox.cli("skills", "install", join(sandbox.root, "src", "leaky"));
    expect((await sandbox.cli("git", "sync", "--allow-secrets")).code).toBe(EXIT_FAILED);

    const remote = join(sandbox.root, "remote.git");
    mkdirSync(remote);
    execFileSync("git", ["init", "-q", "--bare"], { cwd: remote });
    await sandbox.cli("git", "remote", remote);
    const held = await sandbox.cli("git", "sync");
    expect(held.code).toBe(EXIT_FAILED);
    expect(held.stderr).toContain("Error (SECRETS_FOUND)");
  });

  it("--dry-run lists what would go out and changes nothing", async () => {
    const remote = join(sandbox.root, "remote.git");
    mkdirSync(remote);
    execFileSync("git", ["init", "-q", "--bare"], { cwd: remote });
    expect((await sandbox.cli("git", "init")).code).toBe(EXIT_OK);
    expect((await sandbox.cli("git", "remote", remote)).code).toBe(EXIT_OK);
    expect((await sandbox.cli("git", "sync")).code).toBe(EXIT_OK);
    writeSkill(join(sandbox.root, "src"), "fresh");
    expect((await sandbox.cli("skills", "install", join(sandbox.root, "src", "fresh"))).code).toBe(
      EXIT_OK,
    );
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: remote, encoding: "utf8" });

    const dry = await sandbox.cli("git", "sync", "--dry-run");
    expect(dry.code).toBe(EXIT_OK);
    expect(dry.stdout).toContain("Going out:");
    expect(dry.stdout).toMatch(/added\s+fresh/);
    expect(dry.stdout).toContain("Nothing was changed.");
    expect(execFileSync("git", ["rev-parse", "HEAD"], { cwd: remote, encoding: "utf8" })).toBe(
      head,
    );

    const json = await sandbox.cli("git", "sync", "--dry-run", "--json");
    const parsed = JSON.parse(json.stdout) as { preview: { outgoing: { name: string }[] } };
    expect(parsed.preview.outgoing.map((item) => item.name)).toEqual(["fresh"]);
  });
});
