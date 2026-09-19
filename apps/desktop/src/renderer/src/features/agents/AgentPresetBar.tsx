import { type ReactNode, useCallback, useMemo } from "react";
import { PresetBarSection } from "@/features/local-skills/PresetBarSection";
import { useApplySkills } from "@/hooks/mutations/deploy";
import { usePresets } from "@/hooks/queries/presets";
import { useSkills } from "@/hooks/queries/skills";
import type { SkillAgentPair } from "@/lib/preset-state";

const PAIR_SEPARATOR = "::";
const pairId = (skillId: string, agentKey: string): string =>
  `${skillId}${PAIR_SEPARATOR}${agentKey}`;
const unique = (values: readonly string[]): string[] => [...new Set(values)];

/**
 * Preset pills for one agent or a set of agents. A preset counts per skill × agent pair, and a
 * pair exists when the library skill has a deployment for that agent.
 */
export function AgentPresetBar({
  agentKeys,
  hint,
}: {
  agentKeys: readonly string[];
  hint?: string;
}): ReactNode {
  const presets = usePresets();
  const skills = useSkills();
  const { mutateAsync: apply } = useApplySkills();

  const deployed = useMemo(() => {
    const pairs = new Set<string>();
    for (const skill of skills.data ?? []) {
      for (const entry of skill.deployments) pairs.add(pairId(skill.id, entry.agentKey));
    }
    return pairs;
  }, [skills.data]);

  const exists = useCallback(
    (skillId: string, agentKey: string) => deployed.has(pairId(skillId, agentKey)),
    [deployed],
  );

  // `deploy.apply` works on skills × agents and skips pairs already in the wanted state, so the
  // distinct skills and agents of the pairs describe exactly the work to do.
  const run = (pairs: readonly SkillAgentPair[], action: "add" | "remove"): Promise<unknown> =>
    apply({
      skillIds: unique(pairs.map((pair) => pair.skillId)),
      agentKeys: unique(pairs.map((pair) => pair.agentKey)),
      action,
    });

  if (!presets.data || !skills.data) return null;
  return (
    <PresetBarSection
      presets={presets.data}
      skills={skills.data}
      agentKeys={agentKeys}
      exists={exists}
      mode="agent-pair"
      onActivate={(_preset, missing) => run(missing, "add")}
      onDeactivate={(_preset, present) => run(present, "remove")}
      hint={hint}
    />
  );
}
