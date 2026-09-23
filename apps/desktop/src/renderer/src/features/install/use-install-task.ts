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

export interface InstallTaskRunner {
  /** Every install running right now, by key. Survives leaving and re-entering the page. */
  tasks: ReadonlyMap<string, InstallTask>;
  task(key: string): InstallTask | undefined;
  /** Start a task; resolves with its result, or null when it failed (already toasted). */
  run<T>(options: InstallTaskOptions<T>): Promise<T | null>;
  cancel(key: string): void;
}

/**
 * The one way the Install page starts work: progress toast with phase text and Cancel, success
 * toast with "View" and "Deploy to agents…", friendly text for cancelled, offline and timed-out
 * installs. All four tabs go through it.
 */
export function useInstallTask(): InstallTaskRunner {
  const navigate = useNavigate();
  const tasks = useSyncExternalStore(subscribeInstallTasks, getInstallTasks);

  const run = useCallback(
    <T>(options: InstallTaskOptions<T>) =>
      runInstallTask(options, {
        openLibrary: (skillId) =>
          void navigate({ to: "/library", search: skillId ? { skill: skillId } : {} }),
        openSettings: () => void navigate({ to: "/settings", search: { section: "network" } }),
      }),
    [navigate],
  );

  return useMemo(
    () => ({ tasks, task: (key: string) => tasks.get(key), run, cancel: cancelInstallTask }),
    [tasks, run],
  );
}
