import { existsSync, lstatSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createCore, silentLogger } from "@loadout/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_OK } from "../src/run";
import { AGENT, type Run, type Sandbox, createSandbox, writeSkill } from "./harness";

/** `skills list --query`, `skills deploy|undeploy --dry-run` and `skills diff`. */

let sandbox: Sandbox;
const cli = (...argv: string[]): Promise<Run> => sandbox.cli(...argv);

beforeEach(() => {
  sandbox = createSandbox();
});

afterEach(() => sandbox.cleanup());

async function install(name: string, body?: string): Promise<void> {
  writeSkill(join(sandbox.root, "src"), name, body);
  await cli("skills", "install", `./src/${name}`);
}

/** Switch the library to copies, as the Settings page would. */
function useCopies(): void {
  const core = createCore({
    homeDir: sandbox.home,
    configDir: join(sandbox.root, "config"),
    logger: silentLogger,
    safetyScannerPath: null,
  });
  core.ctx.settings.set("deployMode", "copy");
  core.close();
}

describe("skills list --query", () => {
  it("keeps the skills with the text in their name, description or tags", async () => {
    await install("release-notes");
    await install("code-review");
    await cli("skills", "tag", "code-review", "--add", "Quality");

    const names = async (...extra: string[]): Promise<string[]> =>
      (await cli("skills", "list", ...extra, "--json"))
        .json<{ name: string }[]>()
        .map((s) => s.name);
    expect(await names("--query", "RELEASE")).toEqual(["release-notes"]);
    expect(await names("-q", "quality")).toEqual(["code-review"]);
    expect(await names("--query", "for the cli tests")).toEqual(["code-review", "release-notes"]);
    expect(await names("--query", "nothing like it")).toEqual([]);
  });
});

describe("skills deploy --dry-run", () => {
  it("reports what would change and leaves the agent folder alone", async () => {
    await install("alpha");
    const target = join(sandbox.agentSkillsDir, "alpha");

    const dry = await cli("skills", "deploy", "alpha", "--agent", AGENT, "--dry-run");
    expect(dry.code).toBe(EXIT_OK);
    expect(dry.stdout).toContain("Would add 1 deployment and remove 0");
    expect(dry.stdout).toContain("Nothing was changed.");
    expect(existsSync(target)).toBe(false);

    await cli("skills", "deploy", "alpha", "--agent", AGENT);
    const again = await cli("skills", "deploy", "alpha", "-a", AGENT, "--dry-run", "--json");
    expect(again.json()).toMatchObject({ dryRun: true, added: 0, skipped: 1 });

    const undeploy = await cli("skills", "undeploy", "alpha", "-a", AGENT, "--dry-run", "--json");
    expect(undeploy.json()).toMatchObject({ dryRun: true, removed: 1 });
    expect(lstatSync(target).isSymbolicLink()).toBe(true);
  });

  it("names a folder it would refuse to replace, like a real run", async () => {
    await install("alpha");
    writeSkill(sandbox.agentSkillsDir, "alpha", "# made by hand\n");
    const dry = await cli("skills", "deploy", "alpha", "--agent", AGENT, "--dry-run", "--json");
    expect(dry.json()).toMatchObject({ ok: false, code: "TARGET_CONFLICT" });
  });
});

describe("skills diff", () => {
  it("says a linked deployment always matches", async () => {
    await install("alpha");
    await cli("skills", "deploy", "alpha", "--agent", AGENT);
    const run = await cli("skills", "diff", "alpha");
    expect(run.stdout).toContain(`library vs ${AGENT}`);
    expect(run.stdout).toContain("a link to the library, always the same.");
  });

  it("shows a unified diff for a copy edited in the agent's folder", async () => {
    useCopies();
    await install("alpha", "Step one.\n");
    await cli("skills", "deploy", "alpha", "--agent", AGENT);
    const copy = join(sandbox.agentSkillsDir, "alpha");
    expect((await cli("skills", "diff", "alpha")).stdout).toContain(": the same.");

    const document = join(copy, "SKILL.md");
    const text = `---\nname: alpha\ndescription: Test skill alpha for the CLI tests.\n---\n\nStep two.\n`;
    writeFileSync(document, text);
    writeFileSync(join(copy, "notes.md"), "extra\n");

    const run = await cli("skills", "diff", "alpha");
    expect(run.stdout).toContain("2 files differ.");
    expect(run.stdout).toContain("-Step one.");
    expect(run.stdout).toContain("+Step two.");
    expect(run.stdout).toContain(`only in ${AGENT}: notes.md`);

    const json = await cli("skills", "diff", "alpha", "--agent", AGENT, "--json");
    expect(json.json()).toMatchObject({
      name: "alpha",
      comparisons: [{ against: AGENT, state: "differs" }],
    });
  });

  it("says when a skill is not deployed", async () => {
    await install("alpha");
    expect((await cli("skills", "diff", "alpha")).stdout).toBe("alpha is not deployed.\n");
  });
});
