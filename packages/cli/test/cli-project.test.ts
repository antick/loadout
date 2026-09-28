import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SKILLS_FILE_NAME, SKILLS_LOCK_NAME } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Sandbox, createSandbox, writeSkill } from "./harness";

const GITHUB = "https://github.com/";
let box: Sandbox;
let project: string;
let saved: Record<string, string | undefined>;

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

beforeEach(() => {
  box = createSandbox();
  // `acme/skills` clones this folder instead of GitHub.
  const remotes = join(box.root, "remotes");
  const remote = join(remotes, "acme", "skills.git");
  mkdirSync(remote, { recursive: true });
  git(remote, "init", "-q", "-b", "main");
  git(remote, "config", "user.email", "t@example.com");
  git(remote, "config", "user.name", "Test");
  writeSkill(join(remote, "skills"), "pdf");
  writeSkill(join(remote, "skills"), "docx");
  git(remote, "add", "-A");
  git(remote, "commit", "-q", "-m", "initial");
  const env = {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: `url.${remotes}/.insteadOf`,
    GIT_CONFIG_VALUE_0: GITHUB,
  };
  saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  project = join(box.root, "project");
  mkdirSync(project);
  writeFileSync(
    join(project, SKILLS_FILE_NAME),
    `agents = ["claude_code"]\n\n[[sources]]\nurl = "acme/skills"\nskills = ["pdf"]\n`,
  );
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  box.cleanup();
});

describe("project", () => {
  it("shows the plan, applies it, and leaves a lock to commit", async () => {
    const dry = await box.cli("project", "apply", "--dir", project, "--dry-run");
    expect(dry.code).toBe(0);
    expect(dry.stdout).toContain("Dry run: nothing was written.");
    expect(dry.stdout).toMatch(/\.claude\/skills\/pdf\s+pdf\s+add\s+claude_code/);
    expect(existsSync(join(project, ".claude", "skills", "pdf"))).toBe(false);

    const run = await box.cli("project", "apply", "--dir", project);
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("Wrote 1 folder");
    expect(existsSync(join(project, ".claude", "skills", "pdf", "SKILL.md"))).toBe(true);
    expect(JSON.parse(readFileSync(join(project, SKILLS_LOCK_NAME), "utf8"))).toMatchObject({
      folders: [{ folder: ".claude/skills/pdf" }],
    });
    const again = await box.cli("project", "apply", "--dir", project, "--json");
    expect(again.json<{ written: number }>().written).toBe(0);
  });

  it("unapply asks for --yes and removes what apply wrote", async () => {
    await box.cli("project", "apply", "--dir", project);
    expect((await box.cli("project", "unapply", "--dir", project)).code).toBe(2);
    const gone = await box.cli("project", "unapply", "--dir", project, "--yes");
    expect(gone.stdout).toContain("removed 1");
    expect(existsSync(join(project, ".claude", "skills", "pdf"))).toBe(false);
  });

  it("init refuses to overwrite, and writes a file for a new project", async () => {
    expect((await box.cli("project", "init", "--dir", project)).code).toBe(1);
    const fresh = join(box.root, "fresh");
    mkdirSync(fresh);
    const made = await box.cli(
      "project",
      "init",
      "--dir",
      fresh,
      "--agent",
      "claude_code",
      "--source",
      "acme/skills",
    );
    expect(made.code).toBe(0);
    expect(readFileSync(join(fresh, SKILLS_FILE_NAME), "utf8")).toContain('url = "acme/skills"');
    await box.cli("project", "apply", "--dir", fresh);
    expect(existsSync(join(fresh, ".claude", "skills", "docx"))).toBe(true);
  });

  it("says plainly when there is no skills file", async () => {
    const run = await box.cli("project", "apply", "--dir", box.root);
    expect(run.code).toBe(1);
    expect(run.stderr).toContain(`No ${SKILLS_FILE_NAME}`);
  });
});
