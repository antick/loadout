import type { HealthFinding, Skill } from "@loadout/shared";

/** A block set on another device does not remove what this computer already deployed. */
export function blockedFindings(skills: readonly Skill[]): HealthFinding[] {
  return skills.flatMap((skill) =>
    skill.deployments
      .filter((deployment) => skill.blockedAgents.includes(deployment.agentKey))
      .map((deployment) => ({
        area: "deployments" as const,
        severity: "warning" as const,
        message: "Blocked for this agent but still deployed. Remove it, or allow it again.",
        skill: skill.name,
        agent: deployment.agentKey,
        path: deployment.targetPath,
      })),
  );
}
