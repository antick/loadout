import type { CliStatus } from "@loadout/shared";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** When the last background update round finished; null when none has. */
export function useLastAutoUpdateRun(): UseQueryResult<number | null> {
  return useQuery({
    queryKey: keys.updates.lastAutoRun,
    queryFn: () => api.updates.lastAutoRunAt(),
  });
}

/** Where the command-line tool was published and which version it is. */
export function useCliStatus(): UseQueryResult<CliStatus> {
  return useQuery({ queryKey: keys.system.cliStatus, queryFn: () => api.system.cliStatus() });
}
