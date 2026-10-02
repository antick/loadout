import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Sandbox, createSandbox, writeSkill } from "./harness";

let box: Sandbox;
let repo: string;
const saved = { ...process.env };

const git = (...args: string[]): string =>
  execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();

/** `https://github.com/acme/skills`: `main` holds pdf, `dev` adds docx. */
beforeEach(() => {
  box = createSandbox();
  const remotes = join(box.root, "remotes");
  repo = join(remotes, "acme", "skills.git");
  mkdirSync(repo, { recursive: true });
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
  writeSkill(join(repo, "skills"), "pdf");
  git("add", "--all");
  git("commit", "--quiet", "-m", "add pdf");
  git("checkout", "--quiet", "-b", "dev");
  writeSkill(join(repo, "skills"), "docx");
  git("add", "--all");
  git("commit", "--quiet", "-m", "add docx");
  git("checkout", "--quiet", "main");
});

afterEach(() => {
  process.env = { ...saved };
  box.cleanup();
});

interface Installed {
  installed: { name: string; sourceType: string; sourceBranch: string | null }[];
}

async function install(source: string, ...flags: string[]): Promise<Installed["installed"]> {
  const run = await box.cli("skills", "install", source, ...flags, "--json");
  expect(run.stderr).toBe("");
  expect(run.code).toBe(0);
  return (JSON.parse(run.stdout) as Installed).installed;
}

describe("skills install: every Git spelling the app takes", () => {
  it("reads a branch after #", async () => {
    const [docx] = await install("acme/skills#dev", "--skill", "docx");
    expect(docx).toMatchObject({ name: "docx", sourceType: "git", sourceBranch: "dev" });
  });

  it("reads a skill named after the branch", async () => {
    const [docx] = await install("acme/skills#dev@docx");
    expect(docx).toMatchObject({ name: "docx", sourceBranch: "dev" });
  });

  it("reads github: before the repository", async () => {
    const [pdf] = await install("github:acme/skills", "--skill", "pdf");
    expect(pdf).toMatchObject({ name: "pdf", sourceType: "git" });
  });

  it("reads a path inside the repository", async () => {
    const [pdf] = await install("acme/skills/skills/pdf");
    expect(pdf).toMatchObject({ name: "pdf", sourceType: "git" });
  });

  it("reads a pasted skills add command", async () => {
    const [pdf] = await install("npx skills add acme/skills --skill pdf");
    expect(pdf).toMatchObject({ name: "pdf", sourceType: "git" });
  });
});
