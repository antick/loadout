import type { RenameResult, Skill, SkillDocument } from "@loadout/shared";
import { type UseQueryResult, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** Every library skill, with deployments, tags and preset membership. */
export function useSkills(): UseQueryResult<Skill[]> {
  return useQuery({ queryKey: keys.skills.all, queryFn: () => api.skills.list() });
}

/** One library skill; shows the copy from the list cache while the fresh one loads. */
export function useSkill(skillId: string | null | undefined): UseQueryResult<Skill> {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: keys.skills.detail(skillId ?? ""),
    queryFn: () => api.skills.get(skillId ?? ""),
    enabled: Boolean(skillId),
    placeholderData: () =>
      queryClient.getQueryData<Skill[]>(keys.skills.all)?.find((skill) => skill.id === skillId),
  });
}

/** The skill's main document (SKILL.md or the closest match) and its top-level file names. */
export function useSkillDocument(
  skillId: string | null | undefined,
): UseQueryResult<SkillDocument> {
  return useQuery({
    queryKey: keys.skills.document(skillId ?? ""),
    queryFn: () => api.skills.document(skillId ?? ""),
    enabled: Boolean(skillId),
  });
}

/** Every tag in use, sorted by the backend. */
export function useAllTags(): UseQueryResult<string[]> {
  return useQuery({ queryKey: keys.skills.tags, queryFn: () => api.skills.allTags() });
}

/**
 * What renaming a skill to `name` would change, from a dry run: refusals (a taken name, a folder
 * in an agent's way, an edited copy) come back as the query's error. Off while `name` is null.
 */
export function useRenamePreview(
  skillId: string,
  name: string | null,
): UseQueryResult<RenameResult> {
  return useQuery({
    queryKey: keys.skills.renamePreview(skillId, name ?? ""),
    queryFn: () => api.skills.rename(skillId, name ?? "", { dryRun: true }),
    enabled: name !== null,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
}
