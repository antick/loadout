import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findSecrets, findSecretsInFile } from "../src/backup/secret-scan";
import { type Device, createBareRemote, createDevice, joinRemote, rawGit } from "./backup-world";
import { tempDir, writeFile } from "./helpers";

// Built at run time, so this file itself never holds anything that looks like a real key.
const GITHUB_TOKEN = `ghp_${"a1B2c3D4e5".repeat(4)}`;
const ANTHROPIC_KEY = `sk-ant-api03-${"Zx9".repeat(10)}`;
const OPENAI_KEY = `sk-proj-${"Q7w".repeat(12)}`;
/** About 1.3 MB of ordinary lines: more than the check once read of any file. */
const LARGE_TEXT = `${"Reference text for the skill. ".repeat(4)}\n`.repeat(11_000);

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
    // Another key pasted at the same spot is a new finding, not one already allowed.
    const before = findSecrets(
      "s/key.pem",
      "/x",
      "-----BEGIN RSA PRIVATE KEY-----\nAAA\n-----END RSA PRIVATE KEY-----",
    );
    const after = findSecrets(
      "s/key.pem",
      "/x",
      "-----BEGIN RSA PRIVATE KEY-----\nBBB\n-----END RSA PRIVATE KEY-----",
    );
    expect(before[0]?.id).not.toBe(after[0]?.id);
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

describe("searching large files", () => {
  const MIB = 1024 * 1024;
  let temp: ReturnType<typeof tempDir>;
  beforeEach(() => {
    temp = tempDir();
  });
  afterEach(() => temp.cleanup());

  /** `size` bytes of filler, each key at its byte offset with a space on each side. */
  function fileWith(size: number, filler: string, at: [number, string][]): string {
    const bytes = Buffer.from(filler.repeat(Math.ceil(size / filler.length)).slice(0, size));
    for (const [offset, key] of at) bytes.write(` ${key} `, offset - 1);
    const path = join(temp.dir, "big.md");
    writeFileSync(path, bytes);
    return path;
  }

  it("finds a key that a read border cuts in two", () => {
    const line = `${"word ".repeat(19)}\n`;
    const offset = MIB - 10;
    const path = fileWith(2 * MIB, line, [[offset, GITHUB_TOKEN]]);
    const findings = findSecretsInFile("big.md", path) ?? [];
    expect(findings.map((f) => [f.kind, f.line, f.masked])).toEqual([
      ["github_token", Math.floor(offset / line.length) + 1, `ghp_…${GITHUB_TOKEN.slice(-4)}`],
    ]);
  });

  it("searches one over-long line in overlapping pieces, each key once", () => {
    const border = 2 * MIB;
    const path = fileWith(3 * MIB, "abcdefgh ", [
      [border - 1000, GITHUB_TOKEN],
      [border - 30, ANTHROPIC_KEY],
    ]);
    const findings = findSecretsInFile("big.md", path) ?? [];
    expect(findings.map((f) => [f.kind, f.line])).toEqual([
      ["github_token", 1],
      ["anthropic_key", 1],
    ]);
  });

  it("skips a binary file, wherever its first NUL byte is", () => {
    const path = fileWith(2 * MIB, "text ", [
      [10, GITHUB_TOKEN],
      [MIB + 5, "\0"],
    ]);
    expect(findSecretsInFile("big.md", path)).toBeNull();
  });
});

/** Rewrite the leaky skill's document without the token. */
function removeKey(target: Device): void {
  writeFile(
    join(target.ctx.paths.skillsDir, "leaky", "SKILL.md"),
    "---\nname: leaky\ndescription: Test skill leaky\n---\n\nThe token lives in the keychain now.\n",
  );
}

describe("backup push check", () => {
  let temp: ReturnType<typeof tempDir>;
  let device: Device | null = null;

  beforeEach(() => {
    temp = tempDir();
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
      message: expect.stringMatching(
        /^Backup held back: leaky\/SKILL\.md, line \d+ looks like a key or token\. Remove it, or choose Back up anyway on the Backup page\.$/,
      ),
      details: { secrets: [{ file: "leaky/SKILL.md" }] },
    });
    // Nothing reached the remote.
    expect(rawGit(remote, "ls-tree", "-r", "--name-only", "main")).not.toContain("leaky");

    await a.api.allowSecrets(findings.map((finding) => finding.id));
    expect(await a.api.secretFindings()).toEqual([]);
    expect(await a.api.sync()).toMatchObject({ pushed: true });
    expect(rawGit(remote, "ls-tree", "-r", "--name-only", "main")).toContain("leaky/SKILL.md");
  });

  it("holds back a token pasted into a skill's note", async () => {
    const remote = createBareRemote(temp.dir);
    const a = createDevice(temp.dir, "A");
    device = a;
    const skill = a.addSkill("clean");
    await a.api.init();
    await a.api.setRemote(remote);
    expect(await a.api.sync()).toMatchObject({ pushed: true });

    a.store.update(skill.id, { note: `Call it with ${GITHUB_TOKEN}` });
    await expect(a.api.sync()).rejects.toMatchObject({
      code: "SECRETS_FOUND",
      details: { secrets: [{ file: `.loadout/skills/${skill.id}.json`, kind: "github_token" }] },
    });
    expect(rawGit(remote, "log", "-p", "--all")).not.toContain(GITHUB_TOKEN);
  });

  it("still holds back a key that was committed before and removed since", async () => {
    const remote = createBareRemote(temp.dir);
    const a = createDevice(temp.dir, "A");
    device = a;
    await a.api.init();
    // Backed up locally while there was no remote: the key is now in the history.
    a.addSkill("leaky", { body: `Use ${GITHUB_TOKEN} to call the API.` });
    expect(await a.api.sync()).toMatchObject({ pushed: false });
    removeKey(a);

    await a.api.setRemote(remote);
    const findings = await a.api.secretFindings();
    expect(findings).toMatchObject([{ file: "leaky/SKILL.md", committed: true }]);
    await expect(a.api.sync()).rejects.toMatchObject({ code: "SECRETS_FOUND" });
    expect(rawGit(remote, "for-each-ref")).toBe("");

    await a.api.allowSecrets(findings.map((finding) => finding.id));
    expect(await a.api.sync()).toMatchObject({ pushed: true });
  });

  it("reads every committed file of the history, skipping binary ones", async () => {
    const remote = createBareRemote(temp.dir);
    const a = createDevice(temp.dir, "A");
    device = a;
    await a.api.init();
    a.addSkill("mixed");
    const dir = join(a.ctx.paths.skillsDir, "mixed");
    // Not valid UTF-8 first, so a wrong byte count would shift every file read after it.
    writeFileSync(join(dir, "a-latin.txt"), Buffer.from([0xe9, 0xe8, 0x0a]));
    writeFileSync(
      join(dir, "b-image.bin"),
      Buffer.concat([Buffer.from([0]), Buffer.from(GITHUB_TOKEN)]),
    );
    writeFile(join(dir, "c-notes.md"), `Use ${OPENAI_KEY} here.\n`);
    writeFile(join(dir, "d-empty.md"), "");
    writeFile(join(dir, "e-more.md"), `And ${ANTHROPIC_KEY} there.\n`);
    a.git("add", "--all");
    a.git("commit", "--quiet", "-m", "backup: snapshot");
    await a.api.setRemote(remote);
    const findings = await a.api.secretFindings();
    expect(findings.map((finding) => [finding.file, finding.committed]).sort()).toEqual([
      ["mixed/c-notes.md", true],
      ["mixed/e-more.md", true],
    ]);
  });

  it("cleans a removed key out of unpushed history, so the push never carries it", async () => {
    const remote = createBareRemote(temp.dir);
    const a = createDevice(temp.dir, "A");
    device = a;
    a.addSkill("clean");
    await a.api.init();
    await a.api.setRemote(remote);
    await a.api.sync();
    // A snapshot commits locally without the key check: the key is now in unpushed history.
    a.addSkill("leaky", { body: `Use ${GITHUB_TOKEN} to call the API.` });
    a.git("add", "--all");
    a.git("commit", "--quiet", "-m", "backup: snapshot");

    // Still in the file: cleaning would only commit it again.
    await expect(a.api.cleanUpUnpushed()).rejects.toMatchObject({ code: "SECRETS_FOUND" });

    removeKey(a);
    await a.api.cleanUpUnpushed();
    expect(await a.api.secretFindings()).toEqual([]);
    expect(await a.api.sync()).toMatchObject({ pushed: true });
    expect(rawGit(remote, "log", "-p", "--all")).not.toContain(GITHUB_TOKEN);
    expect(rawGit(remote, "ls-tree", "-r", "--name-only", "main")).toContain("leaky/SKILL.md");
  });

  it("never flags what another computer already backed up, even when a merge brings it in", async () => {
    const remote = createBareRemote(temp.dir);
    const a = createDevice(temp.dir, "A");
    device = a;
    a.addSkill("clean");
    await a.api.init();
    await a.api.setRemote(remote);
    await a.api.sync();

    const b = await joinRemote(temp.dir, remote, "B");
    try {
      b.addSkill("shared-key", { body: `Use ${GITHUB_TOKEN} here.` });
      const held = await b.api.secretFindings();
      await b.api.allowSecrets(held.map((finding) => finding.id));
      expect(await b.api.sync()).toMatchObject({ pushed: true });
    } finally {
      b.close();
    }

    // A changes something of its own, so its sync merges B's work before pushing.
    a.addSkill("mine");
    expect(await a.api.sync()).toMatchObject({ pushed: true });
    expect(await a.api.secretFindings()).toEqual([]);
  });

  it("holds back a token in a text file larger than a mebibyte, committed or not", async () => {
    const remote = createBareRemote(temp.dir);
    const a = createDevice(temp.dir, "A");
    device = a;
    await a.api.init();
    a.addSkill("large");
    writeFile(
      join(a.ctx.paths.skillsDir, "large", "reference.md"),
      `${LARGE_TEXT}${GITHUB_TOKEN}\n`,
    );
    await a.api.setRemote(remote);
    await expect(a.api.sync()).rejects.toMatchObject({
      code: "SECRETS_FOUND",
      details: { secrets: [{ file: "large/reference.md", committed: false }] },
    });

    // Backed up locally first: then it is found in the history the push would send.
    a.git("add", "--all");
    a.git("commit", "--quiet", "-m", "backup: snapshot");
    expect(await a.api.secretFindings()).toMatchObject([
      { file: "large/reference.md", committed: true },
    ]);
    await expect(a.api.sync()).rejects.toMatchObject({ code: "SECRETS_FOUND" });
    expect(rawGit(remote, "for-each-ref")).toBe("");
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
