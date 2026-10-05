import type { Preset } from "@loadout/shared";
import { type ReactNode, useCallback, useMemo } from "react";
import { PresetBarSection } from "@/features/local-skills/PresetBarSection";
import { useApplyPreset } from "@/features/presets/preset-mutations";
import { usePresets } from "@/hooks/queries/presets";
import { useSkills } from "@/hooks/queries/skills";

const PAIR_SEPARATOR = "::";
const pairId = (skillId: string, agentKey: string): string =>
  `${skillId}${PAIR_SEPARATOR}${agentKey}`;

/**
 * Preset pills for one agent or a set of agents. A preset counts per skill × agent pair it would
 * deploy (its switch is on and the skill is not blocked there), and a pair exists when the library
 * skill has a deployment for that agent. Clicks apply or remove the preset for these agents, as
 * the Preset page does, so the switches hold and the activity history has an entry.
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
  const { mutateAsync: applyPreset } = useApplyPreset();

  const { deployed, blocked } = useMemo(() => {
    const deployedPairs = new Set<string>();
    const blockedPairs = new Set<string>();
    for (const skill of skills.data ?? []) {
      for (const entry of skill.deployments) deployedPairs.add(pairId(skill.id, entry.agentKey));
      for (const agentKey of skill.blockedAgents) blockedPairs.add(pairId(skill.id, agentKey));
    }
    return { deployed: deployedPairs, blocked: blockedPairs };
  }, [skills.data]);

  const exists = useCallback(
    (skillId: string, agentKey: string) => deployed.has(pairId(skillId, agentKey)),
    [deployed],
  );

  const wanted = useCallback(
    (preset: Preset) => (skillId: string, agentKey: string) =>
      !(preset.switchedOff[skillId]?.includes(agentKey) ?? false) &&
      !blocked.has(pairId(skillId, agentKey)),
    [blocked],
  );

  const run = (preset: Preset, action: "add" | "remove"): Promise<unknown> =>
    applyPreset({ preset, action, agentKeys: [...agentKeys] });

  if (!presets.data || !skills.data) return null;
  return (
    <PresetBarSection
      presets={presets.data}
      skills={skills.data}
      agentKeys={agentKeys}
      exists={exists}
      mode="agent-pair"
      wanted={wanted}
      onActivate={(preset) => run(preset, "add")}
      onDeactivate={(preset) => run(preset, "remove")}
      hint={hint}
    />
  );
}
