import type { AgentInfo, Skill } from "@skillboard/shared";
import { Bot, ChevronRight } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { PageSection } from "@/components/PageSection";
import { PathText } from "@/components/PathText";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useApplySkills, useDeploySkill, useUndeploySkill } from "@/hooks/mutations/deploy";
import { isAgentAvailable, useAgents } from "@/hooks/queries/agents";

interface AgentRowProps {
  agent: AgentInfo;
  skill: Skill;
  deployed: boolean;
  /** Why the agent cannot take new skills; undefined for available agents. */
  unavailableReason?: string;
}

function AgentRow({ agent, skill, deployed, unavailableReason }: AgentRowProps): ReactNode {
  const { t } = useTranslation();
  const deploy = useDeploySkill();
  const undeploy = useUndeploySkill();
  const pending = deploy.isPending || undeploy.isPending;
  const target = skill.deployments.find((entry) => entry.agentKey === agent.key);
  const sharedWith = agent.sharesDirWith.length;

  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <AgentAvatar
        agentKey={agent.key}
        name={agent.displayName}
        status={deployed ? undefined : "off"}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{agent.displayName}</p>
        {unavailableReason ? (
          <p className="truncate text-xs text-muted-foreground">{unavailableReason}</p>
        ) : target?.targetPath ? (
          <PathText path={target.targetPath} />
        ) : (
          <p className="truncate text-xs text-muted-foreground">
            {sharedWith > 0
              ? t("library.agents.sharedFolder", { count: sharedWith })
              : t("library.agents.notDeployed")}
          </p>
        )}
      </div>
      {pending ? <Spinner className="size-3.5 text-muted-foreground" /> : null}
      <Switch
        checked={deployed}
        // An unavailable agent can still be cleaned up, but never deployed to.
        disabled={pending || (Boolean(unavailableReason) && !deployed)}
        aria-label={t(deployed ? "agentBadges.deployedTo" : "agentBadges.notDeployedTo", {
          agent: agent.displayName,
        })}
        onCheckedChange={(next) =>
          (next ? deploy : undeploy).mutate({ skillId: skill.id, agentKey: agent.key })
        }
      />
    </li>
  );
}

/** Every agent with a switch: available ones first, the rest folded away with the reason. */
export function AgentsTab({ skill }: { skill: Skill }): ReactNode {
  const { t } = useTranslation();
  const agents = useAgents();
  const apply = useApplySkills();
  const [showUnavailable, setShowUnavailable] = useState(false);
  const deployedKeys = useMemo(
    () => new Set(skill.deployments.map((entry) => entry.agentKey)),
    [skill.deployments],
  );

  if (agents.isPending) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (agents.isError) {
    return <ErrorState error={agents.error} onRetry={() => void agents.refetch()} />;
  }

  const available = agents.data.filter(isAgentAvailable);
  const unavailable = agents.data.filter((agent) => !isAgentAvailable(agent));
  const availableKeys = available.map((agent) => agent.key);
  const deployedCount = available.filter((agent) => deployedKeys.has(agent.key)).length;

  if (available.length === 0 && unavailable.every((agent) => !deployedKeys.has(agent.key))) {
    return (
      <EmptyState
        icon={Bot}
        title={t("library.agents.noneTitle")}
        description={t("library.agents.noneDescription")}
      />
    );
  }

  const applyAll = (action: "add" | "remove"): void =>
    apply.mutate({ skillIds: [skill.id], agentKeys: availableKeys, action });

  return (
    <div className="flex flex-col gap-6">
      <PageSection
        title={t("library.agents.available")}
        description={t("library.agents.summary", {
          deployed: deployedCount,
          total: available.length,
        })}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={apply.isPending || deployedCount === available.length}
              onClick={() => applyAll("add")}
            >
              {t("library.agents.deployAll")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={apply.isPending || deployedCount === 0}
              onClick={() => applyAll("remove")}
            >
              {t("library.agents.removeAll")}
            </Button>
          </>
        }
      >
        <ul className="divide-y rounded-lg border bg-card">
          {available.map((agent) => (
            <AgentRow
              key={agent.key}
              agent={agent}
              skill={skill}
              deployed={deployedKeys.has(agent.key)}
            />
          ))}
        </ul>
      </PageSection>

      {unavailable.length > 0 ? (
        <Collapsible open={showUnavailable} onOpenChange={setShowUnavailable}>
          <CollapsibleTrigger className="group/unavailable flex items-center gap-1.5 rounded text-xs font-medium tracking-wider text-muted-foreground uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <ChevronRight className="size-3.5 transition-transform duration-150 group-data-[state=open]/unavailable:rotate-90" />
            {t("library.agents.unavailable", { count: unavailable.length })}
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <ul className="divide-y rounded-lg border bg-card">
              {unavailable.map((agent) => (
                <AgentRow
                  key={agent.key}
                  agent={agent}
                  skill={skill}
                  deployed={deployedKeys.has(agent.key)}
                  unavailableReason={t(
                    agent.installed
                      ? "library.agents.reasonDisabled"
                      : "library.agents.reasonNotInstalled",
                  )}
                />
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}
