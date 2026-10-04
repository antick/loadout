import { ApiError, type BatchFailure, type Project } from "@loadout/shared";
import { type UseMutationResult } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/use-api-mutation";
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
  return useApiMutation({
    fn: (path: string) => api.projects.add(path),
    error: false,
  });
}

/** Link a standalone skills folder as a workspace of its own. */
export function useAddLinkedWorkspace(): UseMutationResult<Project, unknown, LinkedWorkspaceInput> {
  return useApiMutation({
    fn: ({ name, path, disabledPath }: LinkedWorkspaceInput) =>
      api.projects.addLinked(name, path, disabledPath),
    error: false,
  });
}

/** Look under a root folder for projects that already hold agent skills. */
export function useScanProjects(): UseMutationResult<string[], unknown, string> {
  return useApiMutation({ fn: (root: string) => api.projects.scan(root), error: false });
}

/** Link several scanned folders one after the other, telling duplicates from real failures. */
export function useAddScannedProjects(): UseMutationResult<AddScannedResult, unknown, string[]> {
  return useApiMutation({
    fn: async (paths: string[]) => {
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
    error: false,
  });
}

export interface DismissSuggestionInput {
  projectId: string;
  /** Skill ids; one or several at once. */
  skillIds: readonly string[];
  dismissed: boolean;
}

/** Stop suggesting skills for a project, or start again. */
export function useSetSuggestionDismissed(): UseMutationResult<
  void,
  unknown,
  DismissSuggestionInput
> {
  return useApiMutation({
    fn: async ({ projectId, skillIds, dismissed }: DismissSuggestionInput) => {
      for (const skillId of skillIds) {
        await api.projects.setSuggestionDismissed(projectId, skillId, dismissed);
      }
    },
    error: "projectPage.suggestedSkills.errors.dismiss",
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
