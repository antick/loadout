import type { BackupIgnoreRules, SyncSkillDiff } from "@loadout/shared";
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

/** One skill here against the version a reviewed sync would bring in. Asked only when opened. */
export function usePreviewDiff(
  skillId: string,
  remoteCommit: string,
  enabled: boolean,
): UseQueryResult<SyncSkillDiff> {
  return useQuery({
    queryKey: keys.backup.previewDiff(skillId, remoteCommit),
    queryFn: () => api.backup.previewDiff(skillId, remoteCommit),
    enabled,
  });
}

/** A conflicting skill here against the other device's version. Asked only when opened. */
export function useConflictDiff(skillKey: string, enabled: boolean): UseQueryResult<SyncSkillDiff> {
  return useQuery({
    queryKey: keys.backup.conflictDiff(skillKey),
    queryFn: () => api.backup.conflictDiff(skillKey),
    enabled,
  });
}
