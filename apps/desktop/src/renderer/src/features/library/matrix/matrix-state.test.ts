import type { Deployment, Skill } from "@loadout/shared";
import { describe, expect, it } from "vitest";
import { PENDING_DEPLOYMENT_PREFIX } from "@/hooks/mutations/deploy";
import { agentColumnCoverage, matrixCellState } from "@/features/library/matrix/matrix-state";

function deployment(agentKey: string, id = `real:${agentKey}`): Deployment {
  return { id, skillId: "s", agentKey, targetPath: "", mode: "symlink", syncedAt: null };
}

function skill(deployedTo: Deployment[], blockedAgents: string[] = []): Skill {
  return { deployments: deployedTo, blockedAgents } as Skill;
}

describe("matrix cell state", () => {
  it("tells deployed, pending, blocked and empty apart", () => {
    const one = skill(
      [deployment("codex"), deployment("cursor", `${PENDING_DEPLOYMENT_PREFIX}s:cursor`)],
      ["cline"],
    );
    expect(matrixCellState(one, "codex")).toBe("deployed");
    expect(matrixCellState(one, "cursor")).toBe("pending");
    expect(matrixCellState(one, "cline")).toBe("blocked");
    expect(matrixCellState(one, "claude_code")).toBe("empty");
  });

  it("shows what is really deployed even when the skill is blocked there", () => {
    expect(matrixCellState(skill([deployment("codex")], ["codex"]), "codex")).toBe("deployed");
  });
});

describe("agent column coverage", () => {
  it("counts deployed skills, leaving blocked ones out of the total", () => {
    const skills = [
      skill([deployment("codex")]),
      skill([]),
      skill([], ["codex"]),
      skill([deployment("codex", `${PENDING_DEPLOYMENT_PREFIX}s:codex`)]),
    ];
    expect(agentColumnCoverage(skills, "codex")).toEqual({ deployed: 2, total: 3 });
    expect(agentColumnCoverage([], "codex")).toEqual({ deployed: 0, total: 0 });
  });
});
