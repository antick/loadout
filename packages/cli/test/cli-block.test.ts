import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXIT_FAILED, EXIT_OK, EXIT_USAGE } from "../src/run";
import { AGENT, type Run, type Sandbox, createSandbox, writeSkill } from "./harness";

let sandbox: Sandbox;
const cli = (...argv: string[]): Promise<Run> => sandbox.cli(...argv);

beforeEach(async () => {
  sandbox = createSandbox();
  writeSkill(join(sandbox.root, "src"), "alpha");
  await cli("skills", "install", "./src/alpha");
});

afterEach(() => sandbox.cleanup());

describe("skills block and unblock", () => {
  it("removes the skill from the agent and refuses to deploy it there", async () => {
    await cli("skills", "deploy", "alpha", "--agent", AGENT);
    expect(existsSync(join(sandbox.agentSkillsDir, "alpha"))).toBe(true);

    const blocked = await cli("skills", "block", "alpha", "--agent", AGENT, "--json");
    expect(blocked.code).toBe(EXIT_OK);
    expect(blocked.json()).toMatchObject({ name: "alpha", blockedAgents: [AGENT] });
    expect(existsSync(join(sandbox.agentSkillsDir, "alpha"))).toBe(false);

    const deploy = await cli("skills", "deploy", "alpha", "--agent", AGENT, "--json");
    expect(deploy.code).toBe(EXIT_OK);
    expect(deploy.json()).toMatchObject({ added: 0, blocked: 1 });
    expect((await cli("skills", "deploy", "alpha", "--agent", AGENT)).stdout).toContain(
      "1 blocked",
    );
    expect(existsSync(join(sandbox.agentSkillsDir, "alpha"))).toBe(false);

    const status = await cli("skills", "status", "alpha", "--json");
    expect(
      status
        .json<{ agents: { agent: string; blocked: boolean }[] }>()
        .agents.find((entry) => entry.agent === AGENT)?.blocked,
    ).toBe(true);
  });

  it("allows the agent again without deploying", async () => {
    await cli("skills", "block", "alpha", "--agent", AGENT);
    const allowed = await cli("skills", "unblock", "alpha", "--agent", AGENT, "--json");
    expect(allowed.json()).toMatchObject({ blockedAgents: [] });
    expect(existsSync(join(sandbox.agentSkillsDir, "alpha"))).toBe(false);
    expect(
      (await cli("skills", "deploy", "alpha", "--agent", AGENT, "--json")).json(),
    ).toMatchObject({ added: 1, blocked: 0 });
  });

  it("needs a skill and an agent it knows", async () => {
    expect((await cli("skills", "block", "alpha")).code).toBe(EXIT_USAGE);
    expect((await cli("skills", "block", "alpha", "--agent", "nope")).code).toBe(EXIT_FAILED);
    expect((await cli("skills", "block", "missing", "--agent", AGENT)).code).toBe(EXIT_FAILED);
  });
});
