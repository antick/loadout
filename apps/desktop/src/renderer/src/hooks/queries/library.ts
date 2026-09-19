import type { LocalSkill, Project, SourceDiff, SourceDocument } from "@skillboard/shared";
import { type UseQueryResult, useQueries, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** Library copy compared file by file with its upstream source. Fetched only when `enabled`. */
export function useSourceDiff(skillId: string, enabled: boolean): UseQueryResult<SourceDiff> {
  return useQuery({
    queryKey: keys.updates.sourceDiff(skillId),
    queryFn: () => api.updates.sourceDiff(skillId),
    enabled,
    retry: false,
  });
}

/** The skill's main document as it is upstream right now. Fetched only when `enabled`. */
export function useSourceDocument(
  skillId: string,
  enabled: boolean,
): UseQueryResult<SourceDocument> {
  return useQuery({
    queryKey: keys.updates.sourceDocument(skillId),
    queryFn: () => api.updates.sourceDocument(skillId),
    enabled,
    retry: false,
  });
}

export interface ProjectSkillCopies {
  project: Project;
  /** Copies of the library skill inside this project, one per agent folder. */
  copies: LocalSkill[];
  isPending: boolean;
  error: unknown;
}

/**
 * Where a library skill lives inside each linked project. One `projects.skills` call per project,
 * shared with the project pages through the same query keys. Missing project folders are skipped.
 */
export function useSkillInProjects(
  skillId: string,
  projects: readonly Project[],
): ProjectSkillCopies[] {
  const reachable = projects.filter((project) => !project.missing);
  return useQueries({
    queries: reachable.map((project) => ({
      queryKey: keys.projects.skills(project.id),
      queryFn: () => api.projects.skills(project.id),
    })),
    combine: (results) =>
      results.flatMap((result, index) => {
        const project = reachable[index];
        if (!project) return [];
        return [
          {
            project,
            copies: (result.data ?? []).filter((local) => local.librarySkillId === skillId),
            isPending: result.isPending,
            error: result.error,
          },
        ];
      }),
  });
}
