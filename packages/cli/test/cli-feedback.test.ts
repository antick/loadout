import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_USAGE } from "../src/run";
import { redirectGithubTo } from "../../core/test/git-env";
import { type Sandbox, createSandbox, writeSkill } from "./harness";

let box: Sandbox;
let repo: string;
let restoreEnv: () => void;

const git = (...args: string[]): string =>
  execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();

beforeEach(() => {
  box = createSandbox();
  const remotes = join(box.root, "remotes");
  repo = join(remotes, "acme", "skills.git");
  mkdirSync(repo, { recursive: true });
  // `https://github.com/…` is served from the folder above.
  restoreEnv = redirectGithubTo(remotes);
  git("init", "--quiet", "--initial-branch=main");
  writeSkill(join(repo, "skills"), "pdf");
  git("add", "--all");
  git("commit", "--quiet", "-m", "add pdf");
});

afterEach(() => {
  restoreEnv();
  box.cleanup();
});

describe("skills feedback", () => {
  it("prepares a report and a link, and sends nothing", async () => {
    await box.cli("skills", "install", "acme/skills", "--skill", "pdf");
    const run = await box.cli(
      "skills",
      "feedback",
      "pdf",
      "-m",
      "It skipped the summary.",
      "--proposal",
      "Print the summary first.",
    );
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("Report on pdf for acme/skills on GitHub. Nothing was sent.");
    expect(run.stdout).toContain("Title: pdf: It skipped the summary.");
    expect(run.stdout).toContain("### Proposed change to SKILL.md");
    expect(run.stdout).toContain("- Skill: `pdf`");
    expect(run.stdout).toContain("https://github.com/acme/skills/issues/new?title=");
    expect(run.stdout).not.toContain(box.root);
  });

  it("gives the whole draft as JSON", async () => {
    await box.cli("skills", "install", "acme/skills", "--skill", "pdf");
    const draft = (
      await box.cli("skills", "feedback", "pdf", "-m", "Wrong output.", "--json")
    ).json<{ skill: string; title: string; url: string; urlHasBody: boolean; target: object }>();
    expect(draft).toMatchObject({
      skill: "pdf",
      title: "pdf: Wrong output.",
      urlHasBody: true,
      target: { host: "github", repository: "acme/skills" },
    });
    expect(new URL(draft.url).searchParams.get("title")).toBe(draft.title);
  });

  it("needs something that went wrong", async () => {
    await box.cli("skills", "install", "acme/skills", "--skill", "pdf");
    const run = await box.cli("skills", "feedback", "pdf");
    expect(run.code).toBe(EXIT_USAGE);
    expect(run.stderr).toContain("Say what went wrong with -m.");
  });

  it("refuses a skill that did not come from a repository", async () => {
    await box.cli("skills", "install", writeSkill(box.root, "loose"));
    const run = await box.cli("skills", "feedback", "loose", "-m", "It broke.");
    expect(run.code).not.toBe(0);
    expect(run.stderr).toContain("nowhere to report it");
  });
});
