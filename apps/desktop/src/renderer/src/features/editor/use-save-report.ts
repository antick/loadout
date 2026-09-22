import type { SaveSkillFileResult } from "@loadout/shared";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAgents } from "@/hooks/queries/agents";

/**
 * Tells the user what a save did beyond writing the file. A plain save says nothing (the status
 * bar shows it); a copy left alone because an agent's copy has edits of its own gets a warning
 * with a way to go and look.
 */
export function useSaveReport(): (result: SaveSkillFileResult) => void {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const agents = useAgents();

  return useCallback(
    (result: SaveSkillFileResult) => {
      if (result.copiesKept.length === 0) return;
      const names = result.copiesKept.map(
        (key) => agents.data?.find((agent) => agent.key === key)?.displayName ?? key,
      );
      const first = result.copiesKept[0];
      toast.warning(t("editor.saved.keptTitle", { count: names.length }), {
        description: t("editor.saved.keptDescription", {
          count: names.length,
          agents: names.join(", "),
        }),
        action: first
          ? {
              label: t("editor.saved.keptAction", { agent: names[0] }),
              onClick: () =>
                void navigate({ to: "/agents/$agentKey", params: { agentKey: first } }),
            }
          : undefined,
      });
    },
    [agents.data, navigate, t],
  );
}
