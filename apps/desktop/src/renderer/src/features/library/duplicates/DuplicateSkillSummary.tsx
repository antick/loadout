import { type Skill, formatRelative } from "@loadout/shared";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AgentBadgeRow } from "@/components/AgentBadgeRow";
import { SkillTags } from "@/components/SkillTags";
import { SourceBadge } from "@/components/SourceBadge";
import { useAvailableAgents } from "@/hooks/queries/agents";

/** One side of a pair: what tells the two apart, and what would move if it were kept. */
export function DuplicateSkillSummary({ skill }: { skill: Skill }): ReactNode {
  const { t } = useTranslation();
  const agents = useAvailableAgents();
  const deployedKeys = useMemo(
    () => new Set(skill.deployments.map((entry) => entry.agentKey)),
    [skill.deployments],
  );
  const blockedKeys = useMemo(() => new Set(skill.blockedAgents), [skill.blockedAgents]);
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <h4 className="min-w-0 truncate text-sm font-semibold">{skill.name}</h4>
        <SourceBadge skill={skill} compact />
      </div>
      <p className="line-clamp-2 min-h-8 text-xs text-muted-foreground">
        {skill.description ?? t("duplicates.noDescription")}
      </p>
      <SkillTags tags={skill.tags} />
      <AgentBadgeRow
        agents={agents.data ?? []}
        deployedKeys={deployedKeys}
        blockedKeys={blockedKeys}
      />
      <p className="text-xs text-muted-foreground">
        {t("duplicates.changed", { when: formatRelative(skill.updatedAt) })}
      </p>
    </div>
  );
}
