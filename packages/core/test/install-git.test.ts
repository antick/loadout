import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGitClient, gitFailure } from "../src/install/git-client";
import { type TestWorld, createTestWorld, makeSkill, writeFile } from "./helpers";
import {
  type InstallHarness,
  commitAll,
  createInstallHarness,
  git,
  initRepo,
  isolateTmpDir,
  leftoverCheckouts,
  redirectGithubTo,
  setEnv,
  skillsDirOf,
} from "./install-fixtures";

let world: TestWorld;
let install: InstallHarness;
let tmp: string;
let remotes: string;
/** Stands in for `https://github.com/acme/skills.git`. */
let remote: string;
let restores: (() => void)[];

beforeEach(() => {
  world = createTestWorld();
  tmp = join(world.root, "tmp");
  remotes = join(world.root, "remotes");
  restores = [isolateTmpDir(tmp), redirectGithubTo(remotes)];
  install = createInstallHarness(world);

  remote = initRepo(join(remotes, "acme", "skills.git"));
  makeSkill(join(remote, "skills"), "pdf", { files: { "scripts/run.sh": "echo pdf" } });
  makeSkill(join(remote, "skills"), "docx");
  commitAll(remote, "initial");
});

afterEach(() => {
  for (const restore of restores) restore();
  world.cleanup();
});

const code = (stderr: string): string => gitFailure("Failed to clone x", stderr).code;

function cacheSlots(): string[] {
  const repos = join(world.base, "cache", "repos");
  return existsSync(repos) ? readdirSync(repos) : [];
}

describe("git preview and confirm", () => {
  it("lists the skills of a repository, then installs the chosen ones under new names", async () => {
    const head = git(remote, "rev-parse", "HEAD");
    const preview = await install.api.previewGit(remote);

    expect(preview).toMatchObject({ repoUrl: remote, branch: null, revision: head });
    expect(preview.skills).toEqual([
      { relPath: "docx", name: "docx", description: "Test skill docx", alreadyInstalled: false },
      { relPath: "pdf", name: "pdf", description: "Test skill pdf", alreadyInstalled: false },
    ]);
    expect(install.progressFor(remote)).toEqual(["cloning", "scanning"]);
    expect(leftoverCheckouts(tmp)).toHaveLength(1);

    const installed = await install.api.confirmGit(preview.previewId, [
      { relPath: "pdf", name: "  My PDF  " },
      { relPath: "docx", name: "   " },
    ]);

    expect(installed.map((s) => s.name)).toEqual(["My PDF", "docx"]);
    expect(installed[0]).toMatchObject({
      dirName: "My PDF",
      sourceType: "git",
      sourceRef: remote,
      sourceUrl: remote,
      sourceSubpath: "skills/pdf",
      sourceBranch: null,
      sourceRevision: head,
      remoteRevision: head,
      updateStatus: "up_to_date",
    });
    expect(readFileSync(join(skillsDirOf(world), "My PDF", "scripts/run.sh"), "utf8")).toBe(
      "echo pdf",
    );
    expect(existsSync(join(skillsDirOf(world), "My PDF", ".git"))).toBe(false);
    expect(install.progressFor(remote).slice(2)).toEqual(["installing", "installing", "done"]);
    expect(leftoverCheckouts(tmp)).toEqual([]);

    // The session is spent: the same id can never install twice.
    await expect(install.api.confirmGit(preview.previewId, [])).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "Clone session expired, please try again",
    });

    const again = await install.api.previewGit(remote);
    expect(again.skills.map((s) => [s.name, s.alreadyInstalled])).toEqual([
      ["docx", true],
      ["pdf", false],
    ]);
    await install.api.cancelPreview(again.previewId);
    expect(leftoverCheckouts(tmp)).toEqual([]);
  });

  it("stops at the first failure and still deletes the checkout", async () => {
    const preview = await install.api.previewGit(remote);
    await expect(
      install.api.confirmGit(preview.previewId, [
        { relPath: "pdf", name: "" },
        { relPath: "../../outside", name: "" },
        { relPath: "docx", name: "" },
      ]),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(world.store.list().map((s) => s.name)).toEqual(["pdf"]);
    expect(leftoverCheckouts(tmp)).toEqual([]);
  });

  it("expires previews nobody confirmed, and cancelPreview never throws", async () => {
    const shortLived = createInstallHarness(world, { previewTtlMs: 1 });
    const preview = await shortLived.api.previewGit(remote);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await expect(shortLived.api.confirmGit(preview.previewId, [])).rejects.toMatchObject({
      message: "Clone session expired, please try again",
    });
    expect(leftoverCheckouts(tmp)).toEqual([]);
    await expect(shortLived.api.cancelPreview(preview.previewId)).resolves.toBeUndefined();
    await expect(shortLived.api.cancelPreview("unknown")).resolves.toBeUndefined();
  });

  it("validates the URL before touching git", async () => {
    const strict = createInstallHarness(world, { allowLocalGitSources: false });
    for (const url of [remote, "ftp://example.com/x.git", "--upload-pack=x", ""]) {
      await expect(strict.api.previewGit(url)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    expect(strict.events).toEqual([]);
    expect(cacheSlots()).toEqual([]);
  });

  it("resolves a tree URL whose branch name contains a slash", async () => {
    git(remote, "checkout", "--quiet", "-b", "feature/next");
    makeSkill(join(remote, "skills"), "pdf", { body: "next version" });
    const branchHead = commitAll(remote, "next");
    git(remote, "checkout", "--quiet", "main");

    const url = "https://github.com/acme/skills/tree/feature/next/skills";
    const preview = await install.api.previewGit(url);
    expect(preview).toMatchObject({
      repoUrl: "https://github.com/acme/skills.git",
      branch: "feature/next",
      revision: branchHead,
    });

    const [skill] = await install.api.confirmGit(preview.previewId, [{ relPath: "pdf", name: "" }]);
    expect(skill).toMatchObject({
      sourceRef: url,
      sourceUrl: "https://github.com/acme/skills.git",
      sourceBranch: "feature/next",
      sourceSubpath: "skills/pdf",
    });
    expect(readFileSync(join(skillsDirOf(world), "pdf", "SKILL.md"), "utf8")).toContain(
      "next version",
    );
  });

  it("names a skill at the repository root after the repository", async () => {
    const single = initRepo(join(remotes, "acme", "solo.git"));
    writeFile(join(single, "SKILL.md"), "# no frontmatter\n");
    commitAll(single);
    const preview = await install.api.previewGit("acme/solo");
    expect(preview.skills.map((s) => [s.relPath, s.name])).toEqual([["solo", "solo"]]);
    const [skill] = await install.api.confirmGit(preview.previewId, [
      { relPath: "solo", name: "" },
    ]);
    expect(skill).toMatchObject({ name: "solo", sourceSubpath: null });
  });

  it("cancels a clone in flight and keeps the cache slot", async () => {
    await install.api.cancelPreview((await install.api.previewGit(remote)).previewId);
    const slots = cacheSlots();
    expect(slots).toHaveLength(1);

    const state = { settled: false };
    const outcome = install.api
      .previewGit(remote)
      .then(
        () => "finished",
        (error: { code?: string }) => error.code,
      )
      .finally(() => {
        state.settled = true;
      });
    // The key is registered a tick after the call starts; cancel as soon as it is.
    while (!state.settled && !(await install.api.cancel(remote))) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    expect(await outcome).toBe("CANCELLED");
    expect(await install.api.cancel(remote)).toBe(false);
    expect(cacheSlots()).toEqual(slots);
    expect(leftoverCheckouts(tmp)).toEqual([]);
  });
});

describe("marketplace install", () => {
  it("installs by skill id, then refreshes the same skill in place", async () => {
    const first = await install.api.fromMarket("acme/skills", "pdf");
    expect(first).toMatchObject({
      name: "pdf",
      dirName: "pdf",
      sourceType: "marketplace",
      sourceRef: "acme/skills/pdf",
      sourceUrl: "https://github.com/acme/skills.git",
      sourceSubpath: "skills/pdf",
      updateStatus: "up_to_date",
    });
    expect(install.progressFor("acme/skills/pdf")).toEqual(["cloning", "installing", "done"]);
    world.store.setTags(first.id, ["keep"]);

    makeSkill(join(remote, "skills"), "pdf", { body: "second edition" });
    const head = commitAll(remote, "edit pdf");
    const second = await install.api.fromMarket("acme/skills", "pdf");

    expect(second.id).toBe(first.id);
    expect(second.tags).toEqual(["keep"]);
    expect(second.sourceRevision).toBe(head);
    expect(readFileSync(join(first.libraryPath, "SKILL.md"), "utf8")).toContain("second edition");
    expect(readdirSync(skillsDirOf(world)).filter((n) => n.startsWith("pdf"))).toEqual(["pdf"]);
    expect(leftoverCheckouts(tmp)).toEqual([]);
  });

  it("keeps line endings as committed when Git would convert them (Git for Windows)", async () => {
    const globalConfig = join(world.root, "gitconfig");
    writeFile(globalConfig, "[core]\n\tautocrlf = true\n");
    restores.push(setEnv({ GIT_CONFIG_GLOBAL: globalConfig }));

    const skill = await install.api.fromMarket("acme/skills", "pdf");

    expect(readFileSync(join(skill.libraryPath, "scripts", "run.sh"), "utf8")).toBe("echo pdf");
    expect(readFileSync(join(skill.libraryPath, "SKILL.md"), "utf8")).not.toContain("\r");
  });

  it("fails cleanly for an unknown skill or a malformed source", async () => {
    await expect(install.api.fromMarket("acme/skills", "nope")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(install.api.fromMarket("acme/skills", "../pdf")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    await expect(install.api.fromMarket("not-a-source", "pdf")).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(leftoverCheckouts(tmp)).toEqual([]);
  });
});

describe("git client", () => {
  it("resolves remote revisions by ref, never by first line", async () => {
    const client = createGitClient(world.ctx);
    const mainHead = git(remote, "rev-parse", "HEAD");
    git(remote, "tag", "-a", "v1", "-m", "release");
    git(remote, "tag", "light");
    git(remote, "checkout", "--quiet", "-b", "aaa-first-in-listing");
    const branchHead = commitAll(remote, "on branch");
    git(remote, "checkout", "--quiet", "main");

    expect(await client.lsRemote(remote)).toBe(mainHead);
    expect(await client.lsRemote(remote, { branch: "aaa-first-in-listing" })).toBe(branchHead);
    // An annotated tag resolves to the commit it points at, not to the tag object.
    expect(git(remote, "rev-parse", "v1")).not.toBe(mainHead);
    expect(await client.lsRemote(remote, { branch: "v1" })).toBe(mainHead);
    expect(await client.lsRemote(remote, { branch: "light" })).toBe(mainHead);
    expect(await client.lsRemote(remote, { branch: "gone" })).toBeNull();
    expect(await client.listRefs(remote)).toEqual({
      branches: ["aaa-first-in-listing", "main"],
      tags: ["light", "v1"],
    });
    expect(await client.gitVersion()).toMatch(/^\d+\.\d+/);
  });

  it("reuses its cache slot, follows new commits and checks out tags", async () => {
    const client = createGitClient(world.ctx);
    const first = await client.checkout(remote);
    expect(existsSync(join(first.dir, "skills", "pdf", "SKILL.md"))).toBe(true);
    expect(existsSync(join(first.dir, ".git"))).toBe(false);
    git(remote, "tag", "v1");
    // Survives only if the slot is fetched into rather than cloned again.
    const marker = join(world.base, "cache", "repos", cacheSlots()[0] ?? "", ".git", "marker");
    writeFile(marker, "kept");

    writeFile(join(remote, "NEW.md"), "new");
    const head = commitAll(remote, "second");
    const second = await client.checkout(`${remote}/`);
    expect(second.revision).toBe(head);
    expect(existsSync(join(second.dir, "NEW.md"))).toBe(true);
    expect(cacheSlots()).toHaveLength(1);

    const tagged = await client.checkout(remote, { branch: "v1" });
    expect(tagged.revision).toBe(first.revision);
    expect(existsSync(join(tagged.dir, "NEW.md"))).toBe(false);
    expect(existsSync(marker)).toBe(true);

    for (const checkout of [first, second, tagged]) await checkout.cleanup();
    expect(leftoverCheckouts(tmp)).toEqual([]);
  });

  it("clones again when the cached slot is broken", async () => {
    const client = createGitClient(world.ctx);
    await (await client.checkout(remote)).cleanup();
    const [slot = ""] = cacheSlots();
    writeFile(join(world.base, "cache", "repos", slot, ".git", "HEAD"), "garbage");
    const checkout = await client.checkout(remote);
    expect(existsSync(join(checkout.dir, "skills", "pdf", "SKILL.md"))).toBe(true);
    await checkout.cleanup();
  });

  it("prunes least recently used slots over the budget before a fresh clone", async () => {
    const other = initRepo(join(remotes, "acme", "other.git"));
    makeSkill(other, "x");
    commitAll(other);
    const client = createGitClient(world.ctx, { cacheLimitBytes: 1 });
    await (await client.checkout(remote)).cleanup();
    const before = cacheSlots();
    await (await client.checkout(other)).cleanup();
    expect(cacheSlots()).toHaveLength(1);
    expect(cacheSlots()).not.toEqual(before);
  });

  it("refuses an aborted signal and reports a missing repository as a git error", async () => {
    const client = createGitClient(world.ctx);
    const controller = new AbortController();
    controller.abort();
    await expect(client.checkout(remote, { signal: controller.signal })).rejects.toMatchObject({
      code: "CANCELLED",
    });
    mkdirSync(join(world.root, "not-a-repo"));
    await expect(client.checkout(join(world.root, "not-a-repo"))).rejects.toMatchObject({
      code: "GIT",
    });
    expect(cacheSlots()).toEqual([]);
  });

  it("says so when git is not installed", async () => {
    const client = createGitClient(world.ctx);
    const restorePath = setEnv({ PATH: join(world.root, "empty-bin") });
    try {
      expect(await client.gitVersion()).toBeNull();
      await expect(client.lsRemote(remote)).rejects.toMatchObject({ code: "GIT_MISSING" });
      await expect(client.checkout(remote)).rejects.toMatchObject({ code: "GIT_MISSING" });
    } finally {
      restorePath();
    }
  });

  it("classifies failures by what git said", () => {
    expect(code("fatal: unable to access 'x': Could not resolve host: github.com")).toBe("NETWORK");
    expect(code("fatal: unable to access 'x': Failed to connect to host port 443")).toBe("NETWORK");
    expect(code("ssh: connect to host h port 22: Connection refused")).toBe("NETWORK");
    expect(code("ssh: connect to host h port 22: Connection timed out")).toBe("NETWORK");
    expect(code("connect: Network is unreachable")).toBe("NETWORK");
    expect(code("fatal: Authentication failed for 'https://x/'")).toBe("GIT_AUTH");
    expect(code("fatal: could not read Username for 'https://x': terminal prompts disabled")).toBe(
      "GIT_AUTH",
    );
    expect(code("git@h: Permission denied (publickey).")).toBe("GIT_AUTH");
    expect(code("fatal: Remote branch nope not found in upstream origin")).toBe("GIT");
    const failure = gitFailure(
      "Failed to clone x",
      "Warning: Permanently added 'h' to known hosts.\nfatal: https://user:secret@h/r not found\n",
    );
    expect(failure.message).toBe("Failed to clone x: https://h/r not found");
  });
});
