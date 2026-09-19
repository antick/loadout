import type { BackupConflict, GithubAuthMethod, SizeReport, Snapshot } from "@skillboard/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
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
