import type { LocalSkill, Project, Skill, SourceComparison } from "@loadout/shared";
import {
  type QueryClient,
  type QueryKey,
  useQueries,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/**
 * Query key of a skill's comparison with its source. Besides the id it holds what the answer
 * depends on: the library copy, where the source is, and the last check (which notices the source
 * moving). Any other change of the skill, or of other skills, keeps the answer: each fetch is a
 * network lookup and a checkout.
 */
export function sourceComparisonKey(skill: Skill): QueryKey {
  return [
    ...keys.updates.comparison(skill.id),
    skill.contentHash,
    skill.sourceType,
    skill.sourceUrl,
    skill.sourceRef,
    skill.sourceBranch,
    skill.sourceSubpath,
    skill.sourceRevision,
    skill.remoteRevision,
    skill.lastCheckedAt,
  ];
}

/** The comparison of this skill fetched last, whatever it was keyed by; undefined when none. */
export function lastSourceComparison(
  queryClient: QueryClient,
  skillId: string,
): SourceComparison | undefined {
  const [latest] = queryClient
    .getQueryCache()
    .findAll({ queryKey: keys.updates.comparison(skillId) })
    .filter((query) => query.state.data !== undefined)
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
  return latest?.state.data as SourceComparison | undefined;
}

/**
 * Library copy compared with its upstream source: changed files and the main document, from one
 * checkout. Fetched only when `enabled`; never again on focus or age, only when the key changes.
 */
export function useSourceComparison(skill: Skill): UseQueryResult<SourceComparison> {
  return useQuery({
    queryKey: sourceComparisonKey(skill),
    queryFn: () => api.updates.compareSource(skill.id),
    retry: false,
    staleTime: Infinity,
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
