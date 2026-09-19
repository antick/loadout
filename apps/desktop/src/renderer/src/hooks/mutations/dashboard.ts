import type { Skill } from "@skillboard/shared";
import { type UseMutationResult, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { invalidateDeployments } from "@/hooks/mutations/deploy";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { toastError, toastSuccess } from "@/lib/toast";

/** Install the bundled management skill and deploy it to the chosen agents. */
export function useSetupAgentControl(): UseMutationResult<Skill, unknown, string[]> {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (agentKeys: string[]) => api.system.setupAgentControl(agentKeys),
    onSuccess: (_skill, agentKeys) =>
      toastSuccess(t("agentControl.done", { count: agentKeys.length })),
    onError: (error) => toastError(error, "agentControl.failed"),
    onSettled: () => {
      invalidateDeployments(queryClient);
      void queryClient.invalidateQueries({ queryKey: keys.system.root });
    },
  });
}

/** Hide the agent-control suggestion for good. */
export function useDismissAgentControl(): UseMutationResult<void, unknown, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.system.dismissAgentControl(),
    onError: (error) => toastError(error),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.system.agentControl }),
  });
}
