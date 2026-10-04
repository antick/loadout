import type { RenameResult } from "@loadout/shared";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/**
 * What renaming a skill to `name` would change, from a dry run: refusals (a taken name, a folder
 * in an agent's way, an edited copy) come back as the query's error. Off while `name` is null.
 */
export function useRenamePreview(
  skillId: string,
  name: string | null,
): UseQueryResult<RenameResult> {
  return useQuery({
    queryKey: keys.skills.renamePreview(skillId, name ?? ""),
    queryFn: () => api.skills.rename(skillId, name ?? "", { dryRun: true }),
    enabled: name !== null,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
}
