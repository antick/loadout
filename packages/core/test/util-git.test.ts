import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { runGit } from "../src/util/git";
import { classifyGitError, gitFailure } from "../src/util/git-errors";
import { tempDir } from "./helpers";

describe("the shared git runner", () => {
  const temp = tempDir("util-git-");
  afterAll(temp.cleanup);

  const config = async (key: string): Promise<string> =>
    (await runGit(["config", "--get", key], { cwd: temp.dir })).stdout.trim();

  it("forces the safety settings on every call", async () => {
    expect(await config("core.hooksPath")).toBe("/dev/null");
    expect(await config("core.fsmonitor")).toBe("false");
    expect(await config("core.protectNTFS")).toBe("true");
    expect(await config("core.autocrlf")).toBe("false");
  });

  it("adds a caller's settings and the proxy only for network calls", async () => {
    const local = await runGit(["config", "--get", "http.proxy"], { cwd: temp.dir });
    expect(local.code).not.toBe(0);
    const remote = await runGit(["config", "--get", "http.proxy"], {
      cwd: temp.dir,
      network: { proxy: "http://proxy.test:8080" },
    });
    expect(remote.stdout.trim()).toBe("http://proxy.test:8080");
    expect(await runGit(["config", "--get", "user.name"], { config: ["user.name=Box"] })).toEqual(
      expect.objectContaining({ stdout: "Box\n" }),
    );
  });

  it("refuses transports outside the allowed list, and allows local repositories", async () => {
    const bare = join(temp.dir, "remote.git");
    mkdirSync(bare);
    expect((await runGit(["init", "--bare", "--quiet", bare])).code).toBe(0);
    const local = await runGit(["ls-remote", `file://${bare}`]);
    expect(local.code).toBe(0);
    const helper = await runGit(["ls-remote", "ext::sh -c true"]);
    expect(helper.code).not.toBe(0);
    expect(helper.stderr).toMatch(/transport 'ext' not allowed/);
  });

  it("reports a missing git as GIT_MISSING", async () => {
    await expect(runGit(["--version"], { binary: join(temp.dir, "no-git") })).rejects.toMatchObject(
      { code: "GIT_MISSING" },
    );
  });
});

describe("classifying git's failures", () => {
  it("tells a refused sign-in from a file that could not be written", () => {
    expect(classifyGitError("remote: Permission to me/r.git denied to other.")).toBe("GIT_AUTH");
    expect(classifyGitError("fatal: The requested URL returned error: 403")).toBe("GIT_AUTH");
    expect(classifyGitError("error: unable to create file a.md: Permission denied")).toBe("GIT");
  });

  it("only gives the codes a caller asks for", () => {
    const unrelated = "fatal: refusing to merge unrelated histories";
    expect(classifyGitError(unrelated)).toBe("GIT_UNRELATED");
    // A failed call only tells network and sign-in trouble apart; the rest is plain GIT.
    expect(gitFailure("Merge", unrelated).code).toBe("GIT");
    expect(gitFailure("Failed to fetch x", "fatal: not a git repository").code).toBe("GIT");
  });
});
