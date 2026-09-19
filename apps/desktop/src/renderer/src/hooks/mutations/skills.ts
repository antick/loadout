import type { BatchResult } from "@skillboard/shared";
import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { toastError, toastSuccess } from "@/lib/toast";

export interface SetSkillTagsInput {
  skillId: string;
  tags: string[];
}

/** Replace one skill's tags. Silent on success: batch callers toast once for the whole set. */
export function useSetSkillTags(): UseMutationResult<void, unknown, SetSkillTagsInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ skillId, tags }: SetSkillTagsInput) => api.skills.setTags(skillId, tags),
    onError: (error) => toastError(error, "errors.saveTags"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.skills.root }),
  });
}

/** Rename a tag everywhere it is used. */
export function useRenameTag(): UseMutationResult<void, unknown, { from: string; to: string }> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: ({ from, to }) => api.skills.renameTag(from, to),
    onSuccess: (_result, { from, to }) => toastSuccess(t("tags.renamed", { from, to })),
    onError: (error) => toastError(error, "errors.saveTags"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.skills.root }),
  });
}

/** Remove a tag from every skill. */
export function useDeleteTag(): UseMutationResult<void, unknown, string> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (tag: string) => api.skills.deleteTag(tag),
    onSuccess: (_result, tag) => toastSuccess(t("tags.deleted", { tag })),
    onError: (error) => toastError(error, "errors.saveTags"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.skills.root }),
  });
}

/** Remove skills from the library (and every agent they were deployed to). Toasts the counts. */
export function useRemoveSkills(): UseMutationResult<BatchResult, unknown, string[]> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (skillIds: string[]) => api.skills.removeMany(skillIds),
    onSuccess: (result) => {
      const summary = t("skills.removed", { count: result.succeeded });
      if (result.failed.length === 0) {
        toastSuccess(summary);
        return;
      }
      toast.warning(t("skills.removedWithFailures", { summary, count: result.failed.length }), {
        description: result.failed
          .map((failure) => `${failure.name}: ${failure.message}`)
          .join("\n"),
        descriptionClassName: "text-xs whitespace-pre-line",
      });
    },
    onError: (error) => toastError(error, "errors.removeSkills"),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.skills.root });
      void queryClient.invalidateQueries({ queryKey: keys.workspace.root });
    },
  });
}
