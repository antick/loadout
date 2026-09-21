import type {
  AppInfo,
  AppUpdateInfo,
  BackupStatus,
  CrashInfo,
  LibraryLocation,
} from "@loadout/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** App name, version, platform and home directory. Never changes while the app runs. */
export function useAppInfo(): UseQueryResult<AppInfo> {
  return useQuery({
    queryKey: keys.app.info,
    queryFn: () => api.app.info(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** Latest app-update check. Disabled until `enabled` so the shell can delay it after launch. */
export function useAppUpdate(enabled: boolean): UseQueryResult<AppUpdateInfo> {
  return useQuery({
    queryKey: keys.app.update,
    queryFn: () => api.app.checkUpdate(),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}

/** Where the library lives, plus any warnings about its configuration. */
export function useLibraryLocation(): UseQueryResult<LibraryLocation> {
  return useQuery({
    queryKey: keys.system.libraryLocation,
    queryFn: () => api.system.libraryLocation(),
  });
}

/** The crash recorded by the previous run, or null. */
export function useLastCrash(): UseQueryResult<CrashInfo | null> {
  return useQuery({ queryKey: keys.system.lastCrash, queryFn: () => api.system.lastCrash() });
}

/** Backup repository status (remote, pending changes, ahead/behind). */
export function useBackupStatus(): UseQueryResult<BackupStatus> {
  return useQuery({ queryKey: keys.backup.status, queryFn: () => api.backup.status() });
}
