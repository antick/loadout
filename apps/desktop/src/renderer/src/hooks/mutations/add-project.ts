import { ApiError, type BatchFailure, type Project } from "@skillboard/shared";
import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { errorMessage } from "@/lib/toast";

export interface LinkedWorkspaceInput {
  name: string;
  path: string;
  disabledPath: string | null;
}

export interface AddScannedResult {
  added: Project[];
  /** Folders that were already in the project list. */
  alreadyLinked: number;
  failed: BatchFailure[];
}

// The dialog shows failures inline next to the form, so none of these hooks toast errors.

/** Link one project folder. */
export function useAddProject(): UseMutationResult<Project, unknown, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => api.projects.add(path),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.projects.root }),
  });
}

/** Link a standalone skills folder as a workspace of its own. */
export function useAddLinkedWorkspace(): UseMutationResult<Project, unknown, LinkedWorkspaceInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, path, disabledPath }: LinkedWorkspaceInput) =>
      api.projects.addLinked(name, path, disabledPath),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.projects.root }),
  });
}

/** Look under a root folder for projects that already hold agent skills. */
export function useScanProjects(): UseMutationResult<string[], unknown, string> {
  return useMutation({ mutationFn: (root: string) => api.projects.scan(root) });
}

/** Link several scanned folders one after the other, telling duplicates from real failures. */
export function useAddScannedProjects(): UseMutationResult<AddScannedResult, unknown, string[]> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (paths: string[]) => {
      const result: AddScannedResult = { added: [], alreadyLinked: 0, failed: [] };
      for (const path of paths) {
        try {
          result.added.push(await api.projects.add(path));
        } catch (error) {
          if (error instanceof ApiError && error.code === "ALREADY_EXISTS") {
            result.alreadyLinked += 1;
          } else result.failed.push({ name: path, message: errorMessage(error) });
        }
      }
      return result;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.projects.root }),
  });
}
