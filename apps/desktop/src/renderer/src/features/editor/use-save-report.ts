import type { SaveSkillFileResult } from "@loadout/shared";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAgents } from "@/hooks/queries/agents";

/**
 * Tells the user what a save did beyond writing the file. A plain save says nothing (the status
 * bar shows it). Project copies that got the change are named; copies left alone because they
 * have edits of their own get a warning, with a way to go and look for deployed copies.
 */
export function useSaveReport(
  /** Names of the project's other copies, as the editor shows them. */
  copyNames: Readonly<Record<string, string>> = {},
): (result: SaveSkillFileResult) => void {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const agents = useAgents();

  return useCallback(
    (result: SaveSkillFileResult) => {
      const nameOf = (key: string): string =>
        copyNames[key] ?? agents.data?.find((agent) => agent.key === key)?.displayName ?? key;
      if (result.otherCopiesSkipped.length > 0) {
        toast.warning(t("editor.saved.skippedTitle", { count: result.otherCopiesSkipped.length }), {
          description: t("editor.saved.skippedDescription", {
            count: result.otherCopiesSkipped.length,
            agents: result.otherCopiesSkipped.map(nameOf).join(", "),
          }),
        });
      } else if (result.otherCopiesSaved.length > 0) {
        toast.success(
          t("editor.saved.carried", {
            count: result.otherCopiesSaved.length,
            agents: result.otherCopiesSaved.map(nameOf).join(", "),
          }),
        );
      }
      if (result.copiesKept.length === 0) return;
      const names = result.copiesKept.map(nameOf);
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
    [agents.data, copyNames, navigate, t],
  );
}
