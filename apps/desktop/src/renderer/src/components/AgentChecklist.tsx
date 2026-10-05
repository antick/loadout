import type { Skill } from "@loadout/shared";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { missingCount } from "@/components/agent-checklist";
import { AgentPicker, type AgentTargetChip } from "@/components/AgentPicker";
import { useAvailableAgents } from "@/hooks/queries/agents";

export interface AgentChecklistProps {
  /** The skills to deploy: each row says how many of them the agent may still get. */
  skills: readonly Skill[];
  chosen: ReadonlySet<string>;
  onChange: (chosen: ReadonlySet<string>) => void;
  /** Sizes the scrolling list. */
  listClassName?: string;
}

/** The available agents to tick for a deploy, with select all or none. */
export function AgentChecklist({
  skills,
  chosen,
  onChange,
  listClassName,
}: AgentChecklistProps): ReactNode {
  const { t } = useTranslation();
  const agents = useAvailableAgents();
  const items = useMemo<AgentTargetChip[]>(
    () =>
      (agents.data ?? []).map((agent) => {
        const missing = missingCount(skills, agent.key);
        return {
          key: agent.key,
          label: agent.displayName,
          agentKeys: [agent.key],
          note:
            missing === 0 ? t("batchDeploy.hasAll") : t("batchDeploy.missing", { count: missing }),
        };
      }),
    [agents.data, skills, t],
  );

  return (
    <AgentPicker
      layout="list"
      label={t("batchDeploy.agents")}
      items={items}
      selected={chosen}
      onChange={onChange}
      loading={agents.isPending}
      emptyText={t("batchDeploy.noAgents")}
      listClassName={listClassName}
    />
  );
}
