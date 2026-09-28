import type { BackupIgnoreRules } from "@loadout/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** What stays out of the backup: the app's defaults and the user's own patterns. */
export function useBackupIgnoreRules(enabled: boolean): UseQueryResult<BackupIgnoreRules> {
  return useQuery({
    queryKey: keys.backup.ignore,
    queryFn: () => api.backup.ignoreRules(),
    enabled,
  });
}
