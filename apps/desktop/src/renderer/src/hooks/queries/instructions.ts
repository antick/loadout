import type { InstructionFile } from "@loadout/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/**
 * Instruction files of the available agents: global when `projectId` is null, else a project's.
 * Linked workspaces have none, so pass `enabled: false` for them.
 */
export function useInstructionFiles(
  projectId: string | null,
  enabled = true,
): UseQueryResult<InstructionFile[]> {
  return useQuery({
    queryKey: keys.instructions.list(projectId),
    queryFn: () => api.instructions.list(projectId),
    enabled,
  });
}
