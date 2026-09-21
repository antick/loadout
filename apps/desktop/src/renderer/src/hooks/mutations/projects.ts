import type { Project } from "@loadout/shared";
import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { toastError, toastSuccess } from "@/lib/toast";
import { sortByIds } from "@/lib/utils";

/** Unlink a project. Nothing inside the project folder is deleted. */
export function useRemoveProject(): UseMutationResult<void, unknown, Project> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (project: Project) => api.projects.remove(project.id),
    onSuccess: (_result, project) => toastSuccess(t("projects.removed", { name: project.name })),
    onError: (error) => toastError(error, "errors.removeProject"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.projects.root }),
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
  return useMutation({
    mutationFn: (ids: string[]) => api.projects.reorder(ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: keys.projects.all });
      const previous = queryClient.getQueryData<Project[]>(keys.projects.all);
      if (previous) queryClient.setQueryData(keys.projects.all, sortByIds(previous, ids));
      return { previous };
    },
    onError: (error, _ids, context) => {
      if (context?.previous) queryClient.setQueryData(keys.projects.all, context.previous);
      toastError(error, "errors.reorder");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.projects.root }),
  });
}

/** Open the project folder in the OS file manager. */
export function useRevealProject(): UseMutationResult<void, unknown, string> {
  return useMutation({
    mutationFn: (projectId: string) => api.projects.reveal(projectId),
    onError: (error) => toastError(error, "errors.reveal"),
  });
}
