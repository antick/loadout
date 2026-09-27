import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findSecrets } from "../src/backup/secrets";
import { type Device, createBareRemote, createDevice, isolateGit, rawGit } from "./backup-world";
import { tempDir, writeFile } from "./helpers";

// Built at run time, so this file itself never holds anything that looks like a real key.
const GITHUB_TOKEN = `ghp_${"a1B2c3D4e5".repeat(4)}`;
const ANTHROPIC_KEY = `sk-ant-api03-${"Zx9".repeat(10)}`;
const OPENAI_KEY = `sk-proj-${"Q7w".repeat(12)}`;

describe("secret patterns", () => {
  it("finds well-known key shapes, masks them, and names the line", () => {
    const text = [
      "# Setup",
      `export GITHUB_TOKEN=${GITHUB_TOKEN}`,
      `anthropic: ${ANTHROPIC_KEY} openai: ${OPENAI_KEY}`,
      "-----BEGIN OPENSSH PRIVATE KEY-----",
    ].join("\n");
    const findings = findSecrets("tool/SKILL.md", "/lib/tool/SKILL.md", text);
    expect(findings.map((f) => [f.kind, f.line])).toEqual([
      ["github_token", 2],
      ["anthropic_key", 3],
      ["openai_key", 3],
      ["private_key", 4],
    ]);
    expect(findings[0]?.masked).toBe(`ghp_…${GITHUB_TOKEN.slice(-4)}`);
    expect(JSON.stringify(findings)).not.toContain(GITHUB_TOKEN);
    // The same text in the same file always has the same id.
    expect(findSecrets("tool/SKILL.md", "/x", `x ${GITHUB_TOKEN}`)[0]?.id).toBe(findings[0]?.id);
  });

  it("catches the less common shapes too", () => {
    const googleKey = `AIza${"Sy0-_ab".repeat(5)}`;
    const text = [
      `key: ${googleKey}`,
      "-----BEGIN PGP PRIVATE KEY BLOCK-----",
      `slack: xapp-1-${"A1b2C3".repeat(3)}`,
      `hook: https://hooks.slack.com/services/T01ABCDEF/B02GHIJKL/${"a1B2".repeat(6)}`,
    ].join("\n");
    expect(findSecrets("s/SKILL.md", "/x", text).map((f) => f.kind)).toEqual([
      "google_key",
      "private_key",
      "slack_token",
      "slack_token",
    ]);
    // Two private keys in one file are two findings: allowing one does not allow the other.
    const keys = findSecrets(
      "s/key.pem",
      "/x",
      "-----BEGIN RSA PRIVATE KEY-----\n\n-----BEGIN RSA PRIVATE KEY-----",
    );
    expect(new Set(keys.map((f) => f.id)).size).toBe(2);
  });

  it("passes prose about keys and documentation placeholders", () => {
    const text = [
      "Put your API key in the OPENAI_API_KEY variable.",
      "AWS example: AKIAIOSFODNN7EXAMPLE",
      "Token looks like ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      "Use sk-... from the dashboard.",
    ].join("\n");
    expect(findSecrets("doc/SKILL.md", "/x", text)).toEqual([]);
  });
});

describe("backup push check", () => {
  let temp: ReturnType<typeof tempDir>;
  let device: Device | null = null;

  beforeEach(() => {
    temp = tempDir();
    isolateGit(temp.dir);
  });
  afterEach(() => {
    device?.close();
    device = null;
    temp.cleanup();
  });

  it("holds back a push that would publish a token until the user allows it", async () => {
    const remote = createBareRemote(temp.dir);
    const a = createDevice(temp.dir, "A");
    device = a;
    a.addSkill("clean");
    await a.api.init();
    await a.api.setRemote(remote);
    expect(await a.api.sync()).toMatchObject({ pushed: true });
    expect(await a.api.secretFindings()).toEqual([]);

    a.addSkill("leaky", { body: `Use ${GITHUB_TOKEN} to call the API.` });
    const findings = await a.api.secretFindings();
    expect(findings).toMatchObject([{ file: "leaky/SKILL.md", kind: "github_token" }]);

    await expect(a.api.sync()).rejects.toMatchObject({
      code: "SECRETS_FOUND",
      details: { secrets: [{ file: "leaky/SKILL.md" }] },
    });
    // Nothing reached the remote.
    expect(rawGit(remote, "ls-tree", "-r", "--name-only", "main")).not.toContain("leaky");

    await a.api.allowSecrets(findings.map((finding) => finding.id));
    expect(await a.api.secretFindings()).toEqual([]);
    expect(await a.api.sync()).toMatchObject({ pushed: true });
    expect(rawGit(remote, "ls-tree", "-r", "--name-only", "main")).toContain("leaky/SKILL.md");
  });

  it("still holds back a key that was committed before and removed since", async () => {
    const remote = createBareRemote(temp.dir);
    const a = createDevice(temp.dir, "A");
    device = a;
    await a.api.init();
    // Backed up locally while there was no remote: the key is now in the history.
    a.addSkill("leaky", { body: `Use ${GITHUB_TOKEN} to call the API.` });
    expect(await a.api.sync()).toMatchObject({ pushed: false });
    a.editSkill("leaky", "The token lives in the keychain now.");

    await a.api.setRemote(remote);
    const findings = await a.api.secretFindings();
    expect(findings).toMatchObject([{ file: "leaky/SKILL.md", committed: true }]);
    await expect(a.api.sync()).rejects.toMatchObject({ code: "SECRETS_FOUND" });
    expect(rawGit(remote, "for-each-ref")).toBe("");

    await a.api.allowSecrets(findings.map((finding) => finding.id));
    expect(await a.api.sync()).toMatchObject({ pushed: true });
  });

  it("checks nothing without a remote: a local backup never leaves the computer", async () => {
    const a = createDevice(temp.dir, "A");
    device = a;
    await a.api.init();
    writeFile(
      join(a.ctx.paths.skillsDir, "leaky", "SKILL.md"),
      `---\nname: leaky\n---\n${GITHUB_TOKEN}\n`,
    );
    expect(await a.api.secretFindings()).toEqual([]);
    expect(await a.api.sync()).toMatchObject({ pushed: false });
  });
});
