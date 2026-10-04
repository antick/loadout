import { existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PublishInput, Skill } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type PublishHooks, type PublishService, createPublishService } from "../src/publish";
import { INTERNAL_KEYS } from "../src/settings/store";
import { hashDir } from "../src/util/hash";
import { type DeployWorld, createDeployWorld } from "./deploy-world";
import { writeFile, rejection } from "./helpers";
import { commitAll, git, initRepo, redirectGithubTo } from "./install-fixtures";

/** A token-shaped string the key check recognises and does not take for a documentation example. */
const FAKE_TOKEN = `ghp_${"aB3dE6gH9jK2mN5pQ8sT1vW4yZ7bC0eF3hJ6"}`;

let world: DeployWorld;
let remote: string;
let hooks: PublishHooks;
let service: PublishService;

/** The user's own Git identity, as it would be in `~/.gitconfig` (the tests' own, git-setup.ts). */
function setUserIdentity(): void {
  writeFileSync(
    process.env.GIT_CONFIG_GLOBAL ?? "",
    "[user]\n\tname = Ada Lovelace\n\temail = ada@example.test\n",
  );
}

function bareRepo(name: string): string {
  const dir = join(world.root, "remotes", `${name}.git`);
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "--quiet", "--bare", "--initial-branch=main");
  return dir;
}

/** A fresh clone of the remote, to look at what was really pushed. */
function inspect(branch = "main", from = remote): string {
  const dir = join(world.root, "inspect", `${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(world.root, "inspect"), { recursive: true });
  git(world.root, "clone", "--quiet", "--branch", branch, from, dir);
  return dir;
}

const commits = (repo = remote, branch = "main"): string[] =>
  git(repo, "log", "--format=%s", branch).split("\n").filter(Boolean);

function publishInput(skills: Skill[], extra: Partial<PublishInput> = {}): PublishInput {
  return { skillIds: skills.map((skill) => skill.id), repo: remote, ...extra };
}

beforeEach(() => {
  world = createDeployWorld();
  setUserIdentity();
  remote = bareRepo("skills");
  hooks = {};
  service = createPublishService(world.ctx, { store: world.store, hooks });
});
afterEach(() => {
  world.cleanup();
});

describe("publish", () => {
  it("puts the skill folders under skills/ of an empty repository, as the user", async () => {
    const pdf = world.addSkill("pdf", { "scripts/run.sh": "echo pdf\n" });
    const docx = world.addSkill("docx");
    const before = hashDir(pdf.libraryPath);

    const result = await service.api.publish(publishInput([pdf, docx]));

    expect(result.published.sort()).toEqual(["docx", "pdf"]);
    expect(result.unchanged).toEqual([]);
    expect(result.commit).toMatch(/^[0-9a-f]{40}$/);
    const clone = inspect();
    expect(readFileSync(join(clone, "skills", "pdf", "scripts", "run.sh"), "utf8")).toBe(
      "echo pdf\n",
    );
    expect(existsSync(join(clone, "skills", "docx", "SKILL.md"))).toBe(true);
    expect(commits()).toEqual(["Add pdf and docx"]);
    expect(git(remote, "log", "-1", "--format=%an <%ae>")).toBe("Ada Lovelace <ada@example.test>");
    // The library is exactly as it was.
    expect(hashDir(pdf.libraryPath)).toBe(before);
    expect(world.store.get(pdf.id)).toEqual(pdf);
  });

  it("copies nothing but the skill: no dependencies, secrets files, logs or links", async () => {
    const pdf = world.addSkill("pdf", {
      "node_modules/dep/index.js": "x\n",
      ".env": "TOKEN=1\n",
      ".env.local": "TOKEN=2\n",
      ".env.example": "TOKEN=\n",
      "venv/bin/python": "x\n",
      "run.log": "log\n",
      "notes/keep.md": "keep\n",
    });
    symlinkSync("/etc/hosts", join(pdf.libraryPath, "link"));
    const plan = await service.api.preview(publishInput([pdf]));
    expect(plan.skills[0]).toMatchObject({ status: "new", leftOutCount: 6 });
    expect(plan.skills[0]?.leftOut).toEqual(
      // Only the first few are named; the count has them all.
      expect.arrayContaining(["node_modules/", ".env", ".env.local", "run.log", "link"]),
    );

    await service.api.publish(publishInput([pdf]));
    const clone = inspect();
    const files = git(clone, "ls-files").split("\n").sort();
    expect(files).toEqual([
      "skills/pdf/.env.example",
      "skills/pdf/SKILL.md",
      "skills/pdf/notes/keep.md",
    ]);
  });

  it("keeps a script executable", async () => {
    const pdf = world.addSkill("pdf", { "run.sh": "#!/bin/sh\n" });
    const script = join(pdf.libraryPath, "run.sh");
    const { chmodSync } = await import("node:fs");
    chmodSync(script, 0o755);
    await service.api.publish(publishInput([pdf]));
    const clone = inspect();
    expect(statSync(join(clone, "skills", "pdf", "run.sh")).mode & 0o111).not.toBe(0);
  });

  it("previews without changing the repository, then says unchanged after publishing", async () => {
    const pdf = world.addSkill("pdf");
    const plan = await service.api.preview(publishInput([pdf]));
    expect(plan).toMatchObject({ repoEmpty: true, newBranch: false });
    expect(plan.skills[0]).toMatchObject({ status: "new", folder: "skills/pdf", reason: null });
    expect(git(remote, "branch", "--list")).toBe("");

    await service.api.publish(publishInput([pdf]));
    const again = await service.api.publish(publishInput([pdf]));
    expect(again.commit).toBeNull();
    expect(again.published).toEqual([]);
    expect(again.unchanged).toEqual(["pdf"]);
    expect(commits()).toHaveLength(1);
  });

  it("updates a changed skill and counts what differs", async () => {
    const pdf = world.addSkill("pdf", { "a.md": "a\n", "b.md": "b\n" });
    await service.api.publish(publishInput([pdf]));
    writeFile(join(pdf.libraryPath, "a.md"), "a changed\n");
    writeFile(join(pdf.libraryPath, "c.md"), "c\n");
    const { rmSync } = await import("node:fs");
    rmSync(join(pdf.libraryPath, "b.md"));

    const plan = await service.api.preview(publishInput([pdf]));
    expect(plan.skills[0]).toMatchObject({
      status: "changed",
      files: { added: 1, changed: 1, removed: 1 },
    });
    const result = await service.api.publish(publishInput([pdf]));
    expect(result.published).toEqual(["pdf"]);
    expect(commits()).toEqual(["Update pdf", "Add pdf"]);
    const clone = inspect();
    expect(existsSync(join(clone, "skills", "pdf", "b.md"))).toBe(false);
    expect(readFileSync(join(clone, "skills", "pdf", "a.md"), "utf8")).toBe("a changed\n");
  });

  it("leaves everything else in the repository alone", async () => {
    const seed = initRepo(join(world.root, "seed"));
    writeFile(join(seed, "README.md"), "# Our skills\n");
    writeFile(join(seed, "skills", "other", "SKILL.md"), "---\nname: other\ndescription: d\n---\n");
    commitAll(seed, "start");
    git(seed, "push", "--quiet", remote, "main");

    const pdf = world.addSkill("pdf");
    await service.api.publish(publishInput([pdf]));
    const clone = inspect();
    expect(readFileSync(join(clone, "README.md"), "utf8")).toBe("# Our skills\n");
    expect(existsSync(join(clone, "skills", "other", "SKILL.md"))).toBe(true);
    expect(commits()).toEqual(["Add pdf", "start"]);
  });

  it("uses the chosen layer and refuses a skill already published in another one", async () => {
    const pdf = world.addSkill("pdf");
    const docx = world.addSkill("docx");
    await service.api.publish(publishInput([pdf], { layer: "curated" }));
    expect(existsSync(join(inspect(), "skills", ".curated", "pdf", "SKILL.md"))).toBe(true);

    const plan = await service.api.preview(publishInput([pdf, docx], { layer: "experimental" }));
    const byName = Object.fromEntries(plan.skills.map((skill) => [skill.name, skill]));
    expect(byName.docx).toMatchObject({ status: "new", folder: "skills/.experimental/docx" });
    expect(byName.pdf).toMatchObject({ status: "skipped" });
    expect(byName.pdf?.reason).toContain("skills/.curated/");

    const result = await service.api.publish(publishInput([pdf, docx], { layer: "experimental" }));
    expect(result.published).toEqual(["docx"]);
    expect(existsSync(join(inspect(), "skills", ".experimental", "pdf"))).toBe(false);
  });

  it("creates a new branch from the default one and leaves the default alone", async () => {
    const seed = initRepo(join(world.root, "seed"));
    writeFile(join(seed, "README.md"), "hello\n");
    commitAll(seed, "start");
    git(seed, "push", "--quiet", remote, "main");
    const mainBefore = git(remote, "rev-parse", "main");

    const pdf = world.addSkill("pdf");
    const plan = await service.api.preview(publishInput([pdf], { branch: "add-skills" }));
    expect(plan).toMatchObject({ newBranch: true, target: { branch: "add-skills" } });
    const result = await service.api.publish(publishInput([pdf], { branch: "add-skills" }));
    expect(result.installCommands).toEqual([]);
    expect(git(remote, "rev-parse", "main")).toBe(mainBefore);
    expect(existsSync(join(inspect("add-skills"), "skills", "pdf", "SKILL.md"))).toBe(true);
    expect(existsSync(join(inspect("add-skills"), "README.md"))).toBe(true);
  });

  it("skips what it cannot publish and still publishes the rest", async () => {
    const pdf = world.addSkill("pdf");
    const broken = world.addSkill("broken");
    const { rmSync } = await import("node:fs");
    rmSync(join(broken.libraryPath, "SKILL.md"));
    const gone = world.addSkill("gone");
    rmSync(gone.libraryPath, { recursive: true });

    const result = await service.api.publish(publishInput([pdf, broken, gone]));
    expect(result.published).toEqual(["pdf"]);
    const reasons = result.plan.skills.filter((s) => s.status === "skipped").map((s) => s.reason);
    expect(reasons).toEqual(["It has no SKILL.md.", "Its folder is missing."]);
  });

  it("remembers the last target for the form", async () => {
    expect(await service.api.defaults()).toBeNull();
    const pdf = world.addSkill("pdf");
    await service.api.publish(publishInput([pdf], { branch: "main", layer: "curated" }));
    expect(await service.api.defaults()).toEqual({
      repo: remote,
      branch: "main",
      layer: "curated",
    });
  });

  it("gives no install command for a folder", async () => {
    const pdf = world.addSkill("pdf");
    const result = await service.api.publish(publishInput([pdf]));
    expect(result.installCommands).toEqual([]);
  });

  it("gives `npx skills add` commands for a GitHub repository", async () => {
    const remotes = join(world.root, "github");
    const restore = redirectGithubTo(remotes);
    try {
      mkdirSync(join(remotes, "acme"), { recursive: true });
      git(
        join(remotes, "acme"),
        "init",
        "--quiet",
        "--bare",
        "--initial-branch=main",
        "skills.git",
      );
      const pdf = world.addSkill("pdf");
      const docx = world.addSkill("docx");
      const input = { skillIds: [pdf.id, docx.id], repo: "acme/skills" };
      const result = await service.api.publish(input);
      expect(result.plan.target.repo).toBe("https://github.com/acme/skills.git");
      expect(result.installCommands).toEqual([
        "npx skills add acme/skills --skill pdf",
        "npx skills add acme/skills --skill docx",
      ]);
      expect(await service.api.defaults()).toMatchObject({
        repo: "https://github.com/acme/skills.git",
      });
    } finally {
      restore();
    }
  });

  it("signs the commit with a plain name when the user has no Git identity", async () => {
    writeFileSync(process.env.GIT_CONFIG_GLOBAL ?? "", "");
    world.ctx.settings.setRaw(INTERNAL_KEYS.backupDeviceName, "Pankaj's MacBook");
    const pdf = world.addSkill("pdf");
    await service.api.publish(publishInput([pdf]));
    const author = git(remote, "log", "-1", "--format=%an <%ae>");
    expect(author).toBe("Loadout <loadout@localhost>");
    expect(author).not.toContain("MacBook");
  });

  it("starts again when its working copy is gone", async () => {
    const pdf = world.addSkill("pdf");
    await service.api.publish(publishInput([pdf]));
    const { rmSync } = await import("node:fs");
    rmSync(join(world.ctx.paths.cacheDir, "publish"), { recursive: true, force: true });
    writeFile(join(pdf.libraryPath, "more.md"), "more\n");
    const result = await service.api.publish(publishInput([pdf]));
    expect(result.published).toEqual(["pdf"]);
    expect(commits()).toEqual(["Update pdf", "Add pdf"]);
  });
});

describe("keys and tokens", () => {
  it("holds back a skill with a token in it and copies nothing", async () => {
    const pdf = world.addSkill("pdf", { "notes.md": `key: ${FAKE_TOKEN}\n` });
    const plan = await service.api.preview(publishInput([pdf]));
    expect(plan.secrets).toHaveLength(1);
    expect(plan.secrets[0]).toMatchObject({ kind: "github_token", file: "skills/pdf/notes.md" });

    const error = await rejection(service.api.publish(publishInput([pdf])));
    expect(error.code).toBe("SECRETS_FOUND");
    expect(error.message).toContain("skills/pdf/notes.md, line 1");
    expect(git(remote, "branch", "--list")).toBe("");
  });

  it("publishes anyway when told it is safe", async () => {
    const pdf = world.addSkill("pdf", { "notes.md": `key: ${FAKE_TOKEN}\n` });
    const result = await service.api.publish(publishInput([pdf], { allowSecrets: true }));
    expect(result.published).toEqual(["pdf"]);
  });
});

describe("what it refuses", () => {
  it("chooses at least one skill", async () => {
    const error = await rejection(service.api.publish({ skillIds: [], repo: remote }));
    expect(error.code).toBe("INVALID_INPUT");
  });

  it("refuses the library's own backup repository, however it is spelled", async () => {
    const pdf = world.addSkill("pdf");
    world.ctx.settings.setRaw(INTERNAL_KEYS.backupRemoteUrl, "git@github.com:me/library.git");
    for (const repo of ["https://github.com/me/library", "https://GitHub.com/me/library.git"]) {
      const error = await rejection(service.api.preview({ skillIds: [pdf.id], repo }));
      expect(error.code).toBe("INVALID_INPUT");
      expect(error.message).toContain("backup repository");
    }
    world.ctx.settings.setRaw(INTERNAL_KEYS.backupRemoteUrl, remote);
    expect((await rejection(service.api.preview(publishInput([pdf])))).message).toContain(
      "backup repository",
    );
  });

  it("refuses a token in the address, a folder inside the library, and odd branch names", async () => {
    const pdf = world.addSkill("pdf");
    const tokenError = await rejection(
      service.api.preview({
        skillIds: [pdf.id],
        repo: "https://user:hunter2@github.com/me/skills.git",
      }),
    );
    expect(tokenError.message).toContain("Leave the token out");
    expect(tokenError.message).not.toContain("hunter2");

    const inside = await rejection(
      service.api.preview({ skillIds: [pdf.id], repo: join(world.base, "cache", "somewhere") }),
    );
    expect(inside.message).toContain("inside this library");

    for (const branch of ["-x", "a..b", "a b", "x.lock", "/x"]) {
      const error = await rejection(service.api.preview(publishInput([pdf], { branch })));
      expect(error.code).toBe("INVALID_INPUT");
    }
  });

  it("refuses a repository that is a single skill itself", async () => {
    const seed = initRepo(join(world.root, "seed"));
    writeFile(join(seed, "SKILL.md"), "---\nname: solo\ndescription: d\n---\n");
    commitAll(seed, "start");
    git(seed, "push", "--quiet", remote, "main");
    const pdf = world.addSkill("pdf");
    const error = await rejection(service.api.publish(publishInput([pdf])));
    expect(error.message).toContain("single skill");
    expect(commits()).toEqual(["start"]);
  });

  it("says so when the repository cannot be reached", async () => {
    const pdf = world.addSkill("pdf");
    const error = await rejection(
      service.api.preview({ skillIds: [pdf.id], repo: join(world.root, "no-such-repo.git") }),
    );
    expect(["GIT", "NETWORK", "GIT_NOT_REPO"]).toContain(error.code);
  });
});

describe("a push that races", () => {
  it("starts again from what the repository holds now", async () => {
    const seed = initRepo(join(world.root, "seed"));
    writeFile(join(seed, "README.md"), "hello\n");
    commitAll(seed, "start");
    git(seed, "push", "--quiet", remote, "main");
    const pdf = world.addSkill("pdf");

    let raced = false;
    hooks.beforePush = () => {
      if (raced) return;
      raced = true;
      // Someone else pushes between our commit and our push.
      writeFile(join(seed, "OTHER.md"), "theirs\n");
      commitAll(seed, "theirs");
      git(seed, "push", "--quiet", remote, "main");
    };
    const result = await service.api.publish(publishInput([pdf]));
    expect(result.published).toEqual(["pdf"]);
    expect(commits()).toEqual(["Add pdf", "theirs", "start"]);
    expect(existsSync(join(inspect(), "OTHER.md"))).toBe(true);
  });

  it("gives up after three refusals and says what to do", async () => {
    const seed = initRepo(join(world.root, "seed"));
    writeFile(join(seed, "README.md"), "hello\n");
    commitAll(seed, "start");
    git(seed, "push", "--quiet", remote, "main");
    const pdf = world.addSkill("pdf");
    let round = 0;
    hooks.beforePush = () => {
      round += 1;
      writeFile(join(seed, `R${round}.md`), "x\n");
      commitAll(seed, `race ${round}`);
      git(seed, "push", "--quiet", remote, "main");
    };
    const error = await rejection(service.api.publish(publishInput([pdf])));
    expect(error.code).toBe("GIT_REJECTED");
    expect(error.message).toContain("did not accept the push");
    expect(commits()).not.toContain("Add pdf");
  });
});
