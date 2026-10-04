import type { Skill } from "@loadout/shared";
import type { UseMutationResult } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";
import { GENERIC_ERROR_KEY } from "@/lib/toast";

/** Install the bundled management skill and deploy it to the chosen agents. */
export function useSetupAgentControl(): UseMutationResult<Skill, unknown, string[]> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (agentKeys: string[]) => api.system.setupAgentControl(agentKeys),
    success: (_skill, agentKeys) => t("agentControl.done", { count: agentKeys.length }),
    error: "agentControl.failed",
  });
}

/** Hide the agent-control suggestion for good. */
export function useDismissAgentControl(): UseMutationResult<void, unknown, void> {
  return useApiMutation({
    fn: () => api.system.dismissAgentControl(),
    error: GENERIC_ERROR_KEY,
  });
}
