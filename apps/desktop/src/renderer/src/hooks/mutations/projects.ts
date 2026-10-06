import { APP_NAME, type Project } from "@loadout/shared";
import type { UseMutationResult } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useReorderMutation } from "@/hooks/use-reorder-mutation";
import { api } from "@/lib/api";
import type { CacheSnapshot } from "@/lib/optimistic";
import { keys } from "@/lib/query-keys";

/**
 * Ask, then unlink a project; nothing inside its folder is deleted. Leaves the project's page once
 * it is gone, from wherever the remove was asked for.
 */
export function useRemoveProject(): {
  ask: (project: Project) => Promise<void>;
  isPending: boolean;
} {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { projectId } = useParams({ strict: false });
  const { mutate, isPending } = useApiMutation({
    fn: (project: Project) => api.projects.remove(project.id),
    success: (_result, project) => t("projects.removed", { name: project.name }),
    error: "errors.removeProject",
  });
  const ask = useCallback(
    async (project: Project) => {
      const ok = await confirm({
        title: t("projects.removeTitle", { name: project.name, app: APP_NAME }),
        description: t("projects.removeDescription"),
        items: [project.path],
        confirmLabel: t("projects.remove"),
        destructive: true,
      });
      if (!ok) return;
      mutate(project, {
        onSuccess: () => {
          if (projectId === project.id) void navigate({ to: "/projects" });
        },
      });
    },
    [confirm, mutate, navigate, projectId, t],
  );
  return { ask, isPending };
}

/** Persist a new project order; the cached list is reordered at once. */
export function useReorderProjects(): UseMutationResult<void, unknown, string[], CacheSnapshot> {
  return useReorderMutation<Project>(
    keys.projects.all,
    (ids) => api.projects.reorder(ids),
    (project) => project.id,
  );
}

/** Pin a project to the top of the sidebar, or unpin it. */
export function useSetProjectPinned(): UseMutationResult<
  void,
  unknown,
  { projectId: string; pinned: boolean }
> {
  return useApiMutation({
    fn: ({ projectId, pinned }) => api.projects.setPinned(projectId, pinned),
    error: "errors.pinProject",
  });
}

/** Open the project folder in the OS file manager. */
export function useRevealProject(): UseMutationResult<void, unknown, string> {
  return useApiMutation({
    fn: (projectId: string) => api.projects.reveal(projectId),
    error: "errors.reveal",
  });
}
