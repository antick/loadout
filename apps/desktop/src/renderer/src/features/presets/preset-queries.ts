import type { PresetAgentToggle } from "@loadout/shared";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
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
