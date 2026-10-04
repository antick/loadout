import type { Skill } from "@loadout/shared";
import { type UseMutationResult, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { toastError, toastSuccess } from "@/lib/toast";

/** Install the bundled management skill and deploy it to the chosen agents. */
export function useSetupAgentControl(): UseMutationResult<Skill, unknown, string[]> {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (agentKeys: string[]) => api.system.setupAgentControl(agentKeys),
    onSuccess: (_skill, agentKeys) =>
      toastSuccess(t("agentControl.done", { count: agentKeys.length })),
    onError: (error) => toastError(error, "agentControl.failed"),
  });
}

/** Hide the agent-control suggestion for good. */
export function useDismissAgentControl(): UseMutationResult<void, unknown, void> {
  return useMutation({
    mutationFn: () => api.system.dismissAgentControl(),
    onError: (error) => toastError(error),
  });
}
