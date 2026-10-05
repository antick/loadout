import type { Skill } from "@loadout/shared";
import type { UseMutationResult } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { api } from "@/lib/api";

/** Install the bundled management skill and deploy it to the chosen agents. */
export function useSetupAgentControl(): UseMutationResult<Skill, unknown, string[]> {
  const { t } = useTranslation();
  return useApiMutation({
    fn: (agentKeys: string[]) => api.system.setupAgentControl(agentKeys),
    success: (_skill, agentKeys) => t("agentControl.done", { count: agentKeys.length }),
    error: "agentControl.failed",
  });
}
