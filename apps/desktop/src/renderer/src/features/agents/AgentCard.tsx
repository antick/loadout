import type { AgentInfo } from "@loadout/shared";
import { Share2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { LinkCard } from "@/components/LinkCard";
import { PathText } from "@/components/PathText";
import { SKILL_ITEM_RAISED_CLASS } from "@/components/skill-item";
import { Skeleton } from "@/components/ui/skeleton";

export interface AgentCardProps {
  agent: AgentInfo;
  /** Skill folders on disk; undefined while the count loads. */
  count: number | undefined;
  /** Display names of the agents that use the same global skills folder. */
  sharedWith: readonly string[];
}

/** One available agent on the overview: opens that agent's skills folder. */
export function AgentCard({ agent, count, sharedWith }: AgentCardProps): ReactNode {
  const { t } = useTranslation();
  return (
    <LinkCard
      link={{ to: "/agents/$agentKey", params: { agentKey: agent.key } }}
      label={t("agents.overview.open", { agent: agent.displayName })}
    >
      <div className="flex items-center gap-3">
        <AgentAvatar agentKey={agent.key} name={agent.displayName} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium">{agent.displayName}</h3>
          {count === undefined ? (
            <Skeleton className="mt-1 h-3.5 w-16" />
          ) : (
            <p className="text-xs text-muted-foreground tabular-nums">
              {t("agents.skillCount", { count })}
            </p>
          )}
        </div>
      </div>
      <PathText path={agent.skillsDir} className={SKILL_ITEM_RAISED_CLASS} />
      {sharedWith.length > 0 ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Share2 className="mt-0.5 size-3 shrink-0" />
          {t("agents.sharedFolder", { agents: sharedWith.join(", ") })}
        </p>
      ) : null}
    </LinkCard>
  );
}
