import type { Project } from "@loadout/shared";
import { type UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { sortByIds } from "@/lib/utils";

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
export function useReorderProjects(): UseMutationResult<
  void,
  unknown,
  string[],
  { previous?: Project[] }
> {
  const queryClient = useQueryClient();
  return useApiMutation({
    fn: (ids: string[]) => api.projects.reorder(ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: keys.projects.all });
      const previous = queryClient.getQueryData<Project[]>(keys.projects.all);
      if (previous) queryClient.setQueryData(keys.projects.all, sortByIds(previous, ids));
      return { previous };
    },
    error: "errors.reorder",
    onError: (_error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(keys.projects.all, context.previous);
    },
  });
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

/**
 * Count an open of a project page, for the sidebar's Frequent group. Silent: a count that could
 * not be saved is not worth telling anyone about.
 */
export function useRecordProjectOpen(): UseMutationResult<void, unknown, string> {
  return useApiMutation({
    fn: (projectId: string) => api.projects.recordOpen(projectId),
    error: false,
    invalidate: [keys.projects.all],
  });
}

/** Open the project folder in the OS file manager. */
export function useRevealProject(): UseMutationResult<void, unknown, string> {
  return useApiMutation({
    fn: (projectId: string) => api.projects.reveal(projectId),
    error: "errors.reveal",
  });
}
