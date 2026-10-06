import type {
  AppInfo,
  AppUpdateStatus,
  BackupStatus,
  CrashInfo,
  DetectedEditor,
  LibraryLocation,
  RepairReport,
} from "@loadout/shared";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { REFETCH_ON_FOCUS } from "@/lib/query-client";
import { keys } from "@/lib/query-keys";

/** App name, version, platform and home directory. Never changes while the app runs. */
export function useAppInfo(): UseQueryResult<AppInfo> {
  return useQuery({
    queryKey: keys.app.info,
    queryFn: () => api.app.info(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** Code editors found on this computer. The main process keeps the detection for a while. */
export function useEditors(): UseQueryResult<DetectedEditor[]> {
  return useQuery({
    queryKey: keys.app.editors,
    queryFn: () => api.app.editors(),
  });
}

/** Where the app-update flow stands. Kept current by `app-update:status` events. */
export function useAppUpdate(): UseQueryResult<AppUpdateStatus> {
  return useQuery({
    queryKey: keys.app.update,
    queryFn: () => api.app.updateStatus(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** Where the library lives, plus any warnings about its configuration. */
export function useLibraryLocation(): UseQueryResult<LibraryLocation> {
  return useQuery({
    queryKey: keys.system.libraryLocation,
    queryFn: () => api.system.libraryLocation(),
  });
}

/** What the deployment repair found at start-up, or null before it ran or once dismissed. */
export function useRepairReport(): UseQueryResult<RepairReport | null> {
  return useQuery({ queryKey: keys.system.repair, queryFn: () => api.system.repairReport() });
}

/** The crash recorded by the previous run, or null. */
export function useLastCrash(): UseQueryResult<CrashInfo | null> {
  return useQuery({ queryKey: keys.system.lastCrash, queryFn: () => api.system.lastCrash() });
}

/** Backup repository status (remote, pending changes, ahead/behind). */
export function useBackupStatus(): UseQueryResult<BackupStatus> {
  return useQuery({
    queryKey: keys.backup.status,
    queryFn: () => api.backup.status(),
    ...REFETCH_ON_FOCUS,
  });
}
