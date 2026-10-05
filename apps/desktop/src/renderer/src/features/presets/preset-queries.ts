import type { Preset, PresetAgentToggle } from "@loadout/shared";
import {
  type QueryObserverResult,
  useQueries,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** Which agents get this skill when the preset is applied. */
export function usePresetToggles(
  presetId: string,
  skillId: string,
): UseQueryResult<PresetAgentToggle[]> {
  return useQuery({
    queryKey: keys.presets.toggles(presetId, skillId),
    queryFn: () => api.presets.toggles(presetId, skillId),
  });
}

/** Is the preset's switch on for this skill and agent? */
export type PresetSwitchLookup = (presetId: string, skillId: string, agentKey: string) => boolean;

/**
 * The per-agent switches of every member of these presets (only skills in `knownSkillIds`), as
 * one lookup. Undefined until every switch has loaded.
 */
export function usePresetSwitches(
  presets: readonly Preset[] | undefined,
  knownSkillIds: ReadonlySet<string>,
): PresetSwitchLookup | undefined {
  const members = useMemo(
    () =>
      (presets ?? []).flatMap((preset) =>
        preset.skillIds
          .filter((skillId) => knownSkillIds.has(skillId))
          .map((skillId) => ({ presetId: preset.id, skillId })),
      ),
    [presets, knownSkillIds],
  );
  // Stable, so the lookup only changes when a switch does.
  const combine = useCallback(
    (results: QueryObserverResult<PresetAgentToggle[]>[]) => {
      if (!presets || results.some((result) => !result.data)) return undefined;
      const on = new Set<string>();
      members.forEach(({ presetId, skillId }, index) => {
        for (const toggle of results[index]?.data ?? []) {
          if (toggle.enabled) on.add(switchKey(presetId, skillId, toggle.agentKey));
        }
      });
      return (presetId: string, skillId: string, agentKey: string) =>
        on.has(switchKey(presetId, skillId, agentKey));
    },
    [presets, members],
  );
  return useQueries({
    queries: members.map(({ presetId, skillId }) => ({
      queryKey: keys.presets.toggles(presetId, skillId),
      queryFn: () => api.presets.toggles(presetId, skillId),
    })),
    combine,
  });
}

const switchKey = (presetId: string, skillId: string, agentKey: string): string =>
  `${presetId}\u0000${skillId}\u0000${agentKey}`;
