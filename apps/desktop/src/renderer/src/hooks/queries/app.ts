import type {
  AppInfo,
  AppUpdateStatus,
  BackupStatus,
  CrashInfo,
  DetectedEditor,
  DiagnosticInfo,
  LibraryLocation,
  RepairReport,
} from "@loadout/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { EDITORS_STALE_MS } from "@/lib/constants";
import { keys } from "@/lib/query-keys";

/** App name, version, platform and home directory. Never changes while the app runs. */
export function useAppInfo(): UseQueryResult<AppInfo> {
  return useQuery({
    queryKey: keys.app.info,
    queryFn: () => api.app.info(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** Code editors found on this computer. Looked for again now and then. */
export function useEditors(): UseQueryResult<DetectedEditor[]> {
  return useQuery({
    queryKey: keys.app.editors,
    queryFn: () => api.app.editors(),
    staleTime: EDITORS_STALE_MS,
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

/** Versions and paths of this computer; `gitVersion` is null when Git is not installed. */
export function useDiagnostics(): UseQueryResult<DiagnosticInfo> {
  return useQuery({ queryKey: keys.system.diagnostics, queryFn: () => api.system.diagnostics() });
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
  return useQuery({ queryKey: keys.backup.status, queryFn: () => api.backup.status() });
}
