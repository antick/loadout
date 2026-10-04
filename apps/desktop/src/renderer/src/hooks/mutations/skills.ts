import {
  REMOVED_KEEP_DAYS,
  type RemoveSkillsResult,
  type RenameResult,
  type Skill,
} from "@loadout/shared";
import { type QueryClient, type UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { toastWithUndo, undoAction } from "@/lib/removed-undo";
import { toastSuccess } from "@/lib/toast";
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

export interface SetSkillNoteInput {
  skillId: string;
  /** Blank takes the note off. */
  note: string;
}

/** Replace the user's note on one skill. */
export function useSetSkillNote(): UseMutationResult<Skill, unknown, SetSkillNoteInput> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ skillId, note }: SetSkillNoteInput) => api.skills.setNote(skillId, note),
    success: (skill) => (skill.note ? t("library.note.saved") : t("library.note.removed")),
    error: "library.note.errors.save",
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

/** Rename a library skill, its deployments and project links; says what could not follow. */
export function useRenameSkill(): UseMutationResult<
  RenameResult,
  unknown,
  { skillId: string; name: string }
> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: ({ skillId, name }) => api.skills.rename(skillId, name),
    onSuccess: (result) => {
      const title = t("library.rename.done", { from: result.from, to: result.to });
      if (result.failed.length === 0) toastSuccess(title);
      else
        toast.warning(title, {
          description: t("library.rename.notRedeployed", {
            agents: result.failed.map((failure) => failure.name).join(", "),
          }),
        });
    },
    error: "library.rename.error",
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

/** Remove skills from the library (and every agent they were deployed to). Toasts the counts. */
export function useRemoveSkills(): UseMutationResult<RemoveSkillsResult, unknown, string[]> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (skillIds: string[]) => api.skills.removeMany(skillIds),
    onSuccess: (result) => {
      const summary = t("skills.removed", { count: result.succeeded });
      const kept = t("skills.removedKept", {
        count: result.removedIds.length,
        days: REMOVED_KEEP_DAYS,
      });
      if (result.failed.length === 0) {
        toastWithUndo(summary, result.removedIds, kept);
        return;
      }
      toast.warning(t("skills.removedWithFailures", { summary, count: result.failed.length }), {
        description: result.failed
          .map((failure) => `${failure.name}: ${failure.message}`)
          .join("\n"),
        descriptionClassName: "text-xs whitespace-pre-line",
        action: undoAction(result.removedIds),
      });
    },
    error: "errors.removeSkills",
  });
}
