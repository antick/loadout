import { type Skill } from "@loadout/shared";
import { type QueryClient, type UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { type CacheSnapshot, patchCachedSkill, restoreCached } from "@/lib/optimistic";

export interface SetSkillTagsInput {
  skillId: string;
  tags: string[];
}

/** Replace one skill's tags. Silent on success: batch callers toast once for the whole set. */
export function useSetSkillTags(): UseMutationResult<void, unknown, SetSkillTagsInput> {
  return useApiMutation({
    fn: ({ skillId, tags }: SetSkillTagsInput) => api.skills.setTags(skillId, tags),
    error: "errors.saveTags",
  });
}

export interface SetFavoriteInput {
  skillId: string;
  favorite: boolean;
}

/** Flip the star wherever the skill is cached, before the backend answers. */
function flipFavorite(
  queryClient: QueryClient,
  { skillId, favorite }: SetFavoriteInput,
): Promise<CacheSnapshot> {
  return patchCachedSkill(queryClient, skillId, (skill) => ({
    ...skill,
    favoritedAt: favorite ? Date.now() : null,
  }));
}

/** Make a skill a favourite or take that back; the star flips at once and rolls back on failure. */
export function useSetFavorite(): UseMutationResult<
  Skill,
  unknown,
  SetFavoriteInput,
  CacheSnapshot
> {
  const queryClient = useQueryClient();
  return useApiMutation({
    fn: ({ skillId, favorite }: SetFavoriteInput) => api.skills.setFavorite(skillId, favorite),
    onMutate: (input) => flipFavorite(queryClient, input),
    error: "library.favorites.errors.save",
    onError: (_error, _input, context) => restoreCached(queryClient, context),
  });
}

/** Rename a tag everywhere it is used. */
export function useRenameTag(): UseMutationResult<void, unknown, { from: string; to: string }> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ from, to }) => api.skills.renameTag(from, to),
    success: (_result, { from, to }) => t("tags.renamed", { from, to }),
    error: "errors.saveTags",
  });
}

/** Remove a tag from every skill. */
export function useDeleteTag(): UseMutationResult<void, unknown, string> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (tag: string) => api.skills.deleteTag(tag),
    success: (_result, tag) => t("tags.deleted", { tag }),
    error: "errors.saveTags",
  });
}
