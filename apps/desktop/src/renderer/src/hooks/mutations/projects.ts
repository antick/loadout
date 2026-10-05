import type { Project } from "@loadout/shared";
import type { UseMutationResult } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { useReorderMutation } from "@/hooks/use-reorder-mutation";
import { api } from "@/lib/api";
import type { CacheSnapshot } from "@/lib/optimistic";
import { keys } from "@/lib/query-keys";

/** Unlink a project. Nothing inside the project folder is deleted. */
export function useRemoveProject(): UseMutationResult<void, unknown, Project> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (project: Project) => api.projects.remove(project.id),
    success: (_result, project) => t("projects.removed", { name: project.name }),
    error: "errors.removeProject",
  });
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
