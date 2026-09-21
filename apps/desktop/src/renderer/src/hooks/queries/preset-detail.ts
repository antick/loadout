import type { PresetAgentToggle } from "@loadout/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** Which agents get this skill when the preset is applied. Fetched only when `enabled`. */
export function usePresetToggles(
  presetId: string,
  skillId: string,
  enabled: boolean,
): UseQueryResult<PresetAgentToggle[]> {
  return useQuery({
    queryKey: keys.presets.toggles(presetId, skillId),
    queryFn: () => api.presets.toggles(presetId, skillId),
    enabled,
  });
}
