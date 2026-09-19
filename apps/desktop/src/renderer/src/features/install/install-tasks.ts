import { ApiError, type InstallProgress, type Skill } from "@skillboard/shared";
import { createElement } from "react";
import { toast } from "sonner";
import { DeployAfterInstallToast } from "@/features/install/DeployAfterInstallToast";
import { INSTALL_SUCCESS_TOAST_MS } from "@/features/install/constants";
import { onAppEvent } from "@/lib/events";
import { i18n } from "@/lib/i18n";
import { errorMessage } from "@/lib/toast";

const TOAST_ID_PREFIX = "install:";
const PERCENT = 100;

/** One install that is running right now. Lives outside React so it survives leaving the page. */
export interface InstallTask {
  /** Progress and cancel key, the same text the backend reports progress under. */
  key: string;
  title: string;
  progress: InstallProgress | null;
  cancellable: boolean;
  cancelling: boolean;
}

export interface InstallTaskSuccess {
  message: string;
  description?: string;
  /** `warning` when the batch finished with some failures. */
  tone?: "success" | "warning";
  /** Skills that landed in the library. Enables "View" and "Deploy to agents…". */
  skills?: readonly Skill[];
  /** Offer "View" (opening the library) even though the result carries no skills. */
  viewLibrary?: boolean;
}

export interface InstallTaskOptions<T> {
  key: string;
  /** Toast title while the task runs, e.g. "Installing pdf-tools". */
  title: string;
  run: () => Promise<T>;
  /** Present when the backend can stop this task; called at most once. */
  cancel?: () => Promise<unknown>;
  /** What to say when it worked. Return null to finish silently (the caller shows the result). */
  success?: (result: T) => InstallTaskSuccess | null;
}

/** Navigation the toasts need; supplied by the hook because the store lives outside the router. */
export interface InstallTaskNavigation {
  /** Open one skill in the library, or the library itself for null. */
  openLibrary(skillId: string | null): void;
  openSettings(): void;
}

type Tasks = ReadonlyMap<string, InstallTask>;

let tasks: Tasks = new Map();
const cancellers = new Map<string, () => Promise<unknown>>();
const subscribers = new Set<() => void>();

function publish(next: Tasks): void {
  tasks = next;
  for (const notify of subscribers) notify();
}

function putTask(task: InstallTask): void {
  publish(new Map(tasks).set(task.key, task));
}

function patchTask(key: string, patch: Partial<InstallTask>): InstallTask | null {
  const current = tasks.get(key);
  if (!current) return null;
  const next = { ...current, ...patch };
  putTask(next);
  return next;
}

function dropTask(key: string): void {
  const next = new Map(tasks);
  next.delete(key);
  cancellers.delete(key);
  publish(next);
}

export function subscribeInstallTasks(notify: () => void): () => void {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

export function getInstallTasks(): Tasks {
  return tasks;
}

/** "Cloning… 42%", "Importing 3/12: name": one line for wherever progress is shown. */
export function installPhaseText(progress: InstallProgress | null): string {
  if (!progress) return i18n.t("install.phase.starting");
  const { phase, current, total, name } = progress;
  if (phase === "cloning" && current !== undefined && total) {
    return i18n.t("install.phase.cloningPercent", {
      percent: Math.round((current / total) * PERCENT),
    });
  }
  if (phase === "installing" && current !== undefined && total) {
    return i18n.t("install.phase.installingCount", { current, total, name: name ?? "" });
  }
  if (phase === "installing" && name) return i18n.t("install.phase.installingNamed", { name });
  return i18n.t(`install.phase.${phase}`);
}

/** 0–100 when the backend reports a measurable step, otherwise null (show an indeterminate bar). */
export function installProgressPercent(progress: InstallProgress | null): number | null {
  if (!progress || progress.current === undefined || !progress.total) return null;
  return Math.min(PERCENT, Math.round((progress.current / progress.total) * PERCENT));
}

function showRunningToast(task: InstallTask): void {
  toast.loading(task.title, {
    id: `${TOAST_ID_PREFIX}${task.key}`,
    description: task.cancelling
      ? i18n.t("install.toast.cancelling")
      : installPhaseText(task.progress),
    duration: Number.POSITIVE_INFINITY,
    action:
      task.cancellable && !task.cancelling
        ? {
            label: i18n.t("common.cancel"),
            // Keep the toast: it turns into "Cancelling…" and then into the outcome.
            onClick: (event) => {
              event.preventDefault();
              cancelInstallTask(task.key);
            },
          }
        : undefined,
  });
}

/** Ask the backend to stop a running task. The task still ends through its own promise. */
export function cancelInstallTask(key: string): void {
  const cancel = cancellers.get(key);
  const task = tasks.get(key);
  if (!cancel || !task || task.cancelling) return;
  const next = patchTask(key, { cancelling: true });
  if (next) showRunningToast(next);
  cancel().catch(() => {
    // The task could not be stopped; let it run on and report its own outcome.
    const restored = patchTask(key, { cancelling: false });
    if (restored) showRunningToast(restored);
  });
}

function showDeployToast(skills: readonly Skill[]): void {
  toast.custom(
    (toastId) =>
      createElement(DeployAfterInstallToast, { skills, onClose: () => toast.dismiss(toastId) }),
    { duration: Number.POSITIVE_INFINITY },
  );
}

function showSuccessToast(
  id: string,
  success: InstallTaskSuccess,
  navigation: InstallTaskNavigation,
): void {
  const skills = success.skills ?? [];
  const canView = skills.length > 0 || success.viewLibrary;
  const show = success.tone === "warning" ? toast.warning : toast.success;
  show(success.message, {
    id,
    description: success.description,
    descriptionClassName: "text-xs whitespace-pre-line",
    duration: INSTALL_SUCCESS_TOAST_MS,
    action: canView
      ? {
          label: i18n.t("install.toast.view"),
          onClick: () =>
            navigation.openLibrary(skills.length === 1 ? (skills[0]?.id ?? null) : null),
        }
      : undefined,
    cancel:
      skills.length > 0
        ? { label: i18n.t("install.toast.deploy"), onClick: () => showDeployToast(skills) }
        : undefined,
  });
}

function showFailureToast(id: string, error: unknown, navigation: InstallTaskNavigation): void {
  const code = error instanceof ApiError ? error.code : null;
  const reset = { id, duration: undefined, action: undefined, cancel: undefined };
  if (code === "CANCELLED") {
    toast.info(i18n.t("install.toast.cancelled"), { ...reset, description: undefined });
    return;
  }
  if (code === "NETWORK" || code === "TIMEOUT") {
    toast.error(i18n.t(code === "NETWORK" ? "install.errors.network" : "install.errors.timeout"), {
      ...reset,
      description: i18n.t("install.errors.proxyHint"),
      action: { label: i18n.t("install.errors.openSettings"), onClick: navigation.openSettings },
    });
    return;
  }
  toast.error(errorMessage(error, "install.errors.generic"), {
    ...reset,
    description: code === "GIT_AUTH" ? i18n.t("install.errors.authHint") : undefined,
  });
}

/**
 * Run one install with a persistent progress toast (phase text, Cancel where possible) and a final
 * toast for the outcome. Resolves with the result, or null when it failed or was cancelled; the
 * failure has already been shown. A second call for a key that is still running is ignored.
 */
export async function runInstallTask<T>(
  options: InstallTaskOptions<T>,
  navigation: InstallTaskNavigation,
): Promise<T | null> {
  const { key, title, run, cancel, success } = options;
  if (tasks.has(key)) return null;

  const id = `${TOAST_ID_PREFIX}${key}`;
  const task: InstallTask = {
    key,
    title,
    progress: null,
    cancellable: Boolean(cancel),
    cancelling: false,
  };
  if (cancel) cancellers.set(key, cancel);
  putTask(task);
  showRunningToast(task);

  const stopListening = onAppEvent("install:progress", (progress) => {
    if (progress.key !== key) return;
    const next = patchTask(key, { progress });
    if (next) showRunningToast(next);
  });

  try {
    const result = await run();
    const outcome = success?.(result) ?? null;
    if (outcome) showSuccessToast(id, outcome, navigation);
    else toast.dismiss(id);
    return result;
  } catch (error) {
    showFailureToast(id, error, navigation);
    return null;
  } finally {
    stopListening();
    dropTask(key);
  }
}
