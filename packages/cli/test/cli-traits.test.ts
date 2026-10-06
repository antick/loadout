import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Skill } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_OK } from "../src/run";
import { type Run, type Sandbox, createSandbox, writeSkill } from "./harness";

let sandbox: Sandbox;
const cli = (...argv: string[]): Promise<Run> => sandbox.cli(...argv);

beforeEach(() => {
  sandbox = createSandbox();
  const source = join(sandbox.root, "src");
  writeSkill(source, "plain");
  const tooling = writeSkill(source, "tooling");
  mkdirSync(join(tooling, "scripts"), { recursive: true });
  writeFileSync(join(tooling, "scripts", "run.sh"), "echo hi\n");
  writeFileSync(
    join(tooling, "SKILL.md"),
    "---\nname: tooling\ndescription: Does tooling things for the CLI tests.\nallowed-tools: Bash\n---\n\nBody\n",
  );
});

afterEach(() => sandbox.cleanup());

describe("what a skill can run", () => {
  it("is marked in the list only for skills that ship code", async () => {
    await cli("skills", "install", "./src/plain");
    await cli("skills", "install", "./src/tooling");
    const list = (await cli("skills", "list")).stdout.split("\n");
    expect(list.find((line) => line.startsWith("tooling"))).toContain("[code]");
    expect(list.find((line) => line.startsWith("plain"))).not.toContain("[code]");
  });

  it("is spelled out by show and present in the JSON", async () => {
    await cli("skills", "install", "./src/tooling");
    const shown = await cli("skills", "show", "tooling");
    expect(shown.code).toBe(EXIT_OK);
    expect(shown.stdout).toContain("Can run:");
    expect(shown.stdout).toContain("scripts/run.sh");
    expect(shown.stdout).toContain("Bash");
    const skill = (await cli("skills", "show", "tooling", "--json")).json<Skill>();
    expect(skill.traits.map((trait) => trait.code)).toEqual(["scripts", "tool_grants"]);
    expect((await cli("skills", "show", "plain", "--json")).stdout).toBeDefined();
  });

  it("is listed in the dry run before anything is installed", async () => {
    const plan = await cli("skills", "install", "./src/tooling", "--dry-run");
    expect(plan.stdout).toContain("CAN RUN");
    expect(plan.stdout).toContain("scripts, pre-approved tools");
    const json = (await cli("skills", "install", "./src/tooling", "--dry-run", "--json")).json<{
      installed: { traits: { code: string }[] }[];
    }>();
    expect(json.installed[0]?.traits.map((trait) => trait.code)).toEqual([
      "scripts",
      "tool_grants",
    ]);
  });
});
