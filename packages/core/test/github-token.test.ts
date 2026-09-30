import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exec } from "../src/util/exec";
import { createGitHubSignIn } from "../src/util/github-token";

/** A GitHub token the computer already has, as git's last credential helper. */

const TOKEN = "ghp_fromTheEnvironment123";
const GH_TOKEN = "gho_fromTheGitHubCli456";

type Run = typeof exec;

function fakeGh(stdout: string, code = 0): { run: Run; calls: string[][] } {
  const calls: string[][] = [];
  const run: Run = async (command, args) => {
    calls.push([command, ...args]);
    return { code, stdout, stderr: "" };
  };
  return { run, calls };
}

describe("finding the token", () => {
  it("takes GITHUB_TOKEN, then GH_TOKEN, before asking the GitHub CLI", async () => {
    const gh = fakeGh(`${GH_TOKEN}\n`);
    const first = createGitHubSignIn(() => ({ GITHUB_TOKEN: TOKEN, PATH: "/bin" }), gh.run);
    expect(await first.origin()).toBe("GITHUB_TOKEN");
    const second = createGitHubSignIn(() => ({ GH_TOKEN: TOKEN, PATH: "/bin" }), gh.run);
    expect(await second.origin()).toBe("GH_TOKEN");
    expect(gh.calls).toEqual([]);
  });

  it("asks `gh auth token` once, and only with a PATH to find it on", async () => {
    const gh = fakeGh(`${GH_TOKEN}\n`);
    const signIn = createGitHubSignIn(() => ({ PATH: "/bin" }), gh.run);
    expect(await signIn.origin()).toBe("gh");
    await signIn.gitEnvironment();
    expect(gh.calls).toEqual([["gh", "auth", "token", "--hostname", "github.com"]]);

    const sandboxed = fakeGh(GH_TOKEN);
    expect(await createGitHubSignIn(() => ({}), sandboxed.run).origin()).toBeNull();
    expect(sandboxed.calls).toEqual([]);
  });

  it("looks again a minute after finding none, so signing in to gh needs no restart", async () => {
    let clock = 0;
    let signedIn = false;
    const calls: string[][] = [];
    const run: Run = async (command, args) => {
      calls.push([command, ...args]);
      return signedIn
        ? { code: 0, stdout: GH_TOKEN, stderr: "" }
        : { code: 1, stdout: "", stderr: "" };
    };
    const signIn = createGitHubSignIn(
      () => ({ PATH: "/bin" }),
      run,
      () => clock,
    );
    expect(await signIn.origin()).toBeNull();
    signedIn = true;
    clock += 59_000;
    expect(await signIn.origin()).toBeNull();
    expect(calls).toHaveLength(1);
    clock += 2_000;
    expect(await signIn.origin()).toBe("gh");
    expect(calls).toHaveLength(2);
  });

  it("keeps a found token for ten minutes, then asks again", async () => {
    let clock = 0;
    const gh = fakeGh(GH_TOKEN);
    const signIn = createGitHubSignIn(
      () => ({ PATH: "/bin" }),
      gh.run,
      () => clock,
    );
    await signIn.origin();
    clock += 9 * 60_000;
    await signIn.gitEnvironment();
    expect(gh.calls).toHaveLength(1);
    clock += 2 * 60_000;
    await signIn.origin();
    expect(gh.calls).toHaveLength(2);
  });

  it("shares one lookup between callers that ask at the same time", async () => {
    const gh = fakeGh(GH_TOKEN);
    const signIn = createGitHubSignIn(() => ({ PATH: "/bin" }), gh.run);
    await Promise.all([signIn.origin(), signIn.gitEnvironment(), signIn.origin()]);
    expect(gh.calls).toHaveLength(1);
  });

  it("has no token when gh is signed out or prints something that is not one", async () => {
    expect(await createGitHubSignIn(() => ({ PATH: "/bin" }), fakeGh("", 1).run).origin()).toBe(
      null,
    );
    const odd = fakeGh("not a\ntoken");
    expect(await createGitHubSignIn(() => ({ PATH: "/bin" }), odd.run).gitEnvironment()).toEqual(
      {},
    );
  });

  it("adds its helper after git config entries the environment already has", async () => {
    const signIn = createGitHubSignIn(() => ({ GITHUB_TOKEN: TOKEN }));
    const env = await signIn.gitEnvironment({ GIT_CONFIG_COUNT: "2" });
    expect(env.GIT_CONFIG_COUNT).toBe("3");
    expect(env.GIT_CONFIG_KEY_2).toBe("credential.https://github.com.helper");
  });
});

describe("git asks the user's own helpers first", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "gh-token-"));
  });

  afterEach(() => rmSync(home, { recursive: true, force: true }));

  async function fill(host: string): Promise<Record<string, string>> {
    const extra = await createGitHubSignIn(() => ({ GITHUB_TOKEN: TOKEN })).gitEnvironment();
    const result = await exec("git", ["credential", "fill"], {
      cwd: home,
      input: `protocol=https\nhost=${host}\n\n`,
      env: {
        PATH: process.env.PATH,
        HOME: home,
        USERPROFILE: home,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_TERMINAL_PROMPT: "0",
        ...extra,
      },
    });
    return Object.fromEntries(
      result.stdout
        .split("\n")
        .filter((line) => line.includes("="))
        .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
    );
  }

  it("fills in the token when nothing else answers for github.com", async () => {
    expect(await fill("github.com")).toMatchObject({
      username: "x-access-token",
      password: TOKEN,
    });
  });

  it("never offers the token to another host", async () => {
    expect((await fill("gitlab.com")).password).toBeUndefined();
  });

  it("leaves a login the user's helper already has alone", async () => {
    writeFileSync(
      join(home, ".gitconfig"),
      '[credential]\n\thelper = "!f() { echo username=me; echo password=mine; }; f"\n',
    );
    expect(await fill("github.com")).toMatchObject({ username: "me", password: "mine" });
  });
});
