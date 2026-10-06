import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  cancelInstallTask,
  getInstallTasks,
  type InstallTask,
  type InstallTaskOptions,
  runInstallTask,
  subscribeInstallTasks,
} from "@/features/install/install-tasks";

/** Start a task; resolves with its result, or null when it failed (already toasted). */
export type RunInstallTask = <T>(options: InstallTaskOptions<T>) => Promise<T | null>;

export interface InstallTasks {
  /** The install running under `key` right now. Survives leaving and re-entering the page. */
  task(key: string): InstallTask | undefined;
  cancel(key: string): void;
}

/**
 * The one way the Install page starts work: progress toast with phase text and Cancel, success
 * toast with "View" and "Deploy to agents…", friendly text for cancelled, offline and timed-out
 * installs. All four tabs go through it. Starting work does not watch progress, so a caller that
 * only starts installs does not draw again on every progress tick.
 */
export function useRunInstallTask(): RunInstallTask {
  const navigate = useNavigate();
  return useCallback(
    <T>(options: InstallTaskOptions<T>) =>
      runInstallTask(options, {
        openLibrary: (skillId) =>
          void navigate({ to: "/library", search: skillId ? { skill: skillId } : {} }),
        openSettings: () => void navigate({ to: "/settings", search: { section: "network" } }),
      }),
    [navigate],
  );
}

/** The installs running right now, for views that show their progress or a Cancel. */
export function useInstallTasks(): InstallTasks {
  const tasks = useSyncExternalStore(subscribeInstallTasks, getInstallTasks);
  return useMemo(
    () => ({ task: (key: string) => tasks.get(key), cancel: cancelInstallTask }),
    [tasks],
  );
}
