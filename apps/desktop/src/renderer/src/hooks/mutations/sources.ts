import type { SourceCheckResult } from "@loadout/shared";
import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { toastError } from "@/lib/toast";

/**
 * Look for new skills in repositories: the ones named, or all. Quiet when there is nothing new;
 * says what was found or added otherwise.
 */
export function useCheckSources(): UseMutationResult<
  SourceCheckResult,
  unknown,
  readonly string[] | undefined
> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (sourceKeys) => api.updates.checkSources(sourceKeys ? [...sourceKeys] : undefined),
    onSuccess: (result, sourceKeys) => {
      const asked = sourceKeys ? new Set(sourceKeys) : null;
      const found = result.news
        .filter((news) => !asked || asked.has(news.sourceKey))
        .reduce((total, news) => total + news.skills.length, 0);
      if (result.added.length > 0) {
        toast.success(t("sources.news.addedToast", { count: result.added.length }), {
          description: result.added.join(", "),
        });
      }
      if (found > 0) toast.info(t("sources.news.foundToast", { count: found }));
    },
    onError: (error) => toastError(error),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.updates.root });
      void queryClient.invalidateQueries({ queryKey: keys.skills.root });
    },
  });
}

/** Stop showing a repository's new skills (some of them, or all). */
export function useDismissSourceNews(): UseMutationResult<
  void,
  unknown,
  { sourceKey: string; paths?: string[] }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sourceKey, paths }) => api.updates.dismissSourceNews(sourceKey, paths),
    onError: (error) => toastError(error),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: keys.updates.news }),
  });
}
