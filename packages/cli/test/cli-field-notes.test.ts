import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Skill } from "@loadout/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Run, type Sandbox, createSandbox, writeSkill } from "./harness";

let sandbox: Sandbox;
const cli = (...argv: string[]): Promise<Run> => sandbox.cli(...argv);

beforeEach(async () => {
  sandbox = createSandbox();
  const dir = writeSkill(join(sandbox.root, "src"), "picky");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    "---\nname: picky\ndescription: Uses fields not every agent reads.\ndisable-model-invocation: true\nallowed-tools: Read\nmodel: opus\n---\n\nBody\n",
  );
  await cli("skills", "install", "./src/picky");
});

afterEach(() => sandbox.cleanup());

describe("frontmatter that some agents skip", () => {
  it("lists the fields a skill uses on the skill", async () => {
    const skill = (await cli("skills", "show", "picky", "--json")).json<Skill>();
    expect(skill.behaviourFields).toEqual(["allowed-tools", "disable-model-invocation", "model"]);
  });

  it("says nothing for Claude Code, which reads them all", async () => {
    const status = (await cli("skills", "status", "picky", "--json")).json<{
      agents: { agent: string; fieldNotes: unknown[] }[];
    }>();
    expect(status.agents.find((agent) => agent.agent === "claude_code")?.fieldNotes).toEqual([]);
  });
});
