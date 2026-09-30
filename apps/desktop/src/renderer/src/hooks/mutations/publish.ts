import type {
  ClawhubAccount,
  ClawhubPublishInput,
  ClawhubPublishResult,
  PublishInput,
  PublishPlan,
  PublishResult,
} from "@loadout/shared";
import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { toastError, toastSuccess } from "@/lib/toast";

/**
 * Look at the repository and say what publishing would do. Errors are shown in the dialog next to
 * the address that caused them, so there is no toast here.
 */
export function usePublishPreview(): UseMutationResult<PublishPlan, unknown, PublishInput> {
  return useMutation({ mutationFn: (input) => api.publish.preview(input) });
}

/** Copy the skills into the repository and push. Errors stay in the dialog too. */
export function usePublishSkills(): UseMutationResult<PublishResult, unknown, PublishInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => api.publish.publish(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.publish.root });
      void queryClient.invalidateQueries({ queryKey: keys.system.root });
    },
  });
}

/** Save a ClawHub token once the registry confirms it; null forgets the saved one. */
export function useSetClawhubToken(): UseMutationResult<ClawhubAccount, unknown, string | null> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (token) => api.publish.setClawhubToken(token),
    onSuccess: (account) =>
      toastSuccess(
        account.handle
          ? t("settings.marketplaces.clawhub.saved", { handle: account.handle })
          : t("settings.marketplaces.clawhub.forgotten"),
      ),
    onError: (error) => toastError(error, "settings.marketplaces.clawhub.errors.save"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.publish.root }),
  });
}

/** Upload one version of a skill to ClawHub. Errors stay in the dialog. */
export function usePublishToClawhub(): UseMutationResult<
  ClawhubPublishResult,
  unknown,
  ClawhubPublishInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => api.publish.publishToClawhub(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.publish.root });
      void queryClient.invalidateQueries({ queryKey: keys.system.root });
    },
  });
}
