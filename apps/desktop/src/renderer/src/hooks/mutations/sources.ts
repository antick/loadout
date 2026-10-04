import type { SourceCheckResult } from "@loadout/shared";
import type { UseMutationResult } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { GENERIC_ERROR_KEY } from "@/lib/toast";

/**
 * Look for new skills in repositories: the ones named, or all. Quiet when there is nothing new;
 * says what was found or added otherwise.
 */
export function useCheckSources(): UseMutationResult<
  SourceCheckResult,
  unknown,
  readonly string[] | undefined
> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (sourceKeys) => api.updates.checkSources(sourceKeys ? [...sourceKeys] : undefined),
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
    error: GENERIC_ERROR_KEY,
  });
}

/** Stop showing a repository's new skills (some of them, or all). */
export function useDismissSourceNews(): UseMutationResult<
  void,
  unknown,
  { sourceKey: string; paths?: string[] }
> {
  return useApiMutation({
    fn: ({ sourceKey, paths }) => api.updates.dismissSourceNews(sourceKey, paths),
    error: GENERIC_ERROR_KEY,
  });
}
