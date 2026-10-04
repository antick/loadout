import type {
  ClawhubAccount,
  ClawhubPublishInput,
  ClawhubPublishResult,
  PublishInput,
  PublishPlan,
  PublishResult,
} from "@loadout/shared";
import { type UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/**
 * Look at the repository and say what publishing would do. Errors are shown in the dialog next to
 * the address that caused them, so there is no toast here.
 */
export function usePublishPreview(): UseMutationResult<PublishPlan, unknown, PublishInput> {
  return useApiMutation({ fn: (input) => api.publish.preview(input), error: false });
}

/** Copy the skills into the repository and push. Errors stay in the dialog too. */
export function usePublishSkills(): UseMutationResult<PublishResult, unknown, PublishInput> {
  const queryClient = useQueryClient();
  return useApiMutation({
    fn: (input) => api.publish.publish(input),
    error: false,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.publish.root }),
  });
}

/** Save a ClawHub token once the registry confirms it; null forgets the saved one. */
export function useSetClawhubToken(): UseMutationResult<ClawhubAccount, unknown, string | null> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (token) => api.publish.setClawhubToken(token),
    success: (account) =>
      account.handle
        ? t("settings.marketplaces.clawhub.saved", { handle: account.handle })
        : t("settings.marketplaces.clawhub.forgotten"),
    error: "settings.marketplaces.clawhub.errors.save",
    invalidate: [keys.publish.root],
  });
}

/** Upload one version of a skill to ClawHub. Errors stay in the dialog. */
export function usePublishToClawhub(): UseMutationResult<
  ClawhubPublishResult,
  unknown,
  ClawhubPublishInput
> {
  const queryClient = useQueryClient();
  return useApiMutation({
    fn: (input) => api.publish.publishToClawhub(input),
    error: false,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.publish.root });
      void queryClient.invalidateQueries({ queryKey: keys.system.root });
    },
  });
}
