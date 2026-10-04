import type {
  BackupConflict,
  BackupIgnoreRules,
  GithubAuthMethod,
  SecretFinding,
  SizeReport,
  Snapshot,
  SyncSkillDiff,
} from "@loadout/shared";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** Snapshots of the library, newest first. Only a repository has any. */
export function useBackupSnapshots(enabled: boolean): UseQueryResult<Snapshot[]> {
  return useQuery({
    queryKey: keys.backup.snapshots,
    queryFn: () => api.backup.snapshots(),
    enabled,
  });
}

/** Skills changed on two devices that still wait for a choice. */
export function useBackupConflicts(): UseQueryResult<BackupConflict[]> {
  return useQuery({ queryKey: keys.backup.conflicts, queryFn: () => api.backup.conflicts() });
}

/** Library size and the skills that are too large to back up. */
export function useBackupSizeReport(): UseQueryResult<SizeReport> {
  return useQuery({ queryKey: keys.backup.size, queryFn: () => api.backup.sizeReport() });
}

/** The name this machine signs its backups with. */
export function useBackupDeviceName(): UseQueryResult<string> {
  return useQuery({ queryKey: keys.backup.device, queryFn: () => api.backup.deviceName() });
}

/** How the GitHub connection was made (token or sign-in), or null when unknown. */
export function useGithubAuthMethod(): UseQueryResult<GithubAuthMethod> {
  return useQuery({
    queryKey: keys.backup.authMethod,
    queryFn: () => api.backup.githubAuthMethod(),
  });
}

/** Whether "Sign in with GitHub" can be offered (an OAuth client id is configured). */
export function useGithubDeviceAvailable(): UseQueryResult<boolean> {
  return useQuery({
    queryKey: keys.backup.deviceAvailable,
    queryFn: () => api.backup.githubDeviceAvailable(),
  });
}

/** What the next backup would hold back as a possible key or token. Only asked with a remote. */
export function useBackupSecrets(enabled: boolean): UseQueryResult<SecretFinding[]> {
  return useQuery({
    queryKey: keys.backup.secrets,
    queryFn: () => api.backup.secretFindings(),
    enabled,
  });
}

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
