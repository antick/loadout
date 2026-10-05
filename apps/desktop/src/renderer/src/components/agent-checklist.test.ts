import type { Deployment } from "@loadout/shared";
import { describe, expect, it } from "vitest";
import { deployPlan } from "@/components/agent-checklist";
import { skill } from "@/test/skill";

const deployedTo = (agentKey: string): Deployment => ({ agentKey }) as Deployment;

describe("deployPlan", () => {
  it("leaves out agents a skill is blocked for or already deployed to", () => {
    const skills = [
      skill("a", { blockedAgents: ["cursor"] }),
      skill("b", { deployments: [deployedTo("codex")] }),
    ];
    expect(deployPlan(skills, ["cursor", "codex", "claude_code"])).toEqual({
      agentKeys: ["cursor", "codex", "claude_code"],
      skillIds: ["a", "b"],
      pairs: 4,
    });
    // Blocked for the only agent chosen: nothing to deploy.
    expect(deployPlan([skills[0]!], ["cursor"])).toEqual({ agentKeys: [], skillIds: [], pairs: 0 });
  });
});
