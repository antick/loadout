import { type AgentInfo, isAgentAvailable, type Skill } from "@loadout/shared";
import { Bot, ChevronRight, MoreHorizontal } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { EmptyState } from "@/components/EmptyState";
import { IconButton } from "@/components/IconButton";
import { ErrorState } from "@/components/ErrorState";
import { PageSection } from "@/components/PageSection";
import { PathText } from "@/components/PathText";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useSetBlocked } from "@/features/library/library-mutations";
import { useApplySkills, useConfirmUndeploy } from "@/hooks/mutations/deploy";
import { type AgentToggle, useAgentToggle } from "@/features/library/use-agent-toggle";
import { useAgents } from "@/hooks/queries/agents";
import { useSkillAgentKeys } from "@/features/library/use-skill-agent-keys";
import { AgentFieldNote } from "@/features/library/detail/AgentFieldNote";
import { SECTION_LABEL } from "@/lib/styles";
import { cn } from "@/lib/utils";

interface AgentRowProps {
  agent: AgentInfo;
  skill: Skill;
  deployed: boolean;
  /** The skill is blocked for this agent (`Skill.blockedAgents`). */
  blocked: boolean;
  /** Why the agent cannot take new skills; undefined for available agents. */
  unavailableReason?: string;
  /** Made once by the tab for every row. */
  toggle: AgentToggle;
}

function AgentRow({
  agent,
  skill,
  deployed,
  blocked,
  unavailableReason,
  toggle,
}: AgentRowProps): ReactNode {
  const { t } = useTranslation();
  const [toggling, setToggling] = useState(false);
  const setBlocked = useSetBlocked();
  const pending = toggling || setBlocked.isPending;
  const isBlocked = blocked && !deployed;
  const target = skill.deployments.find((entry) => entry.agentKey === agent.key);
  const sharedWith = agent.sharesDirWith.length;

  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <AgentAvatar
        agentKey={agent.key}
        name={agent.displayName}
        status={isBlocked ? "blocked" : deployed ? undefined : "off"}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{agent.displayName}</p>
        {unavailableReason ? (
          <p className="truncate text-xs text-muted-foreground">{unavailableReason}</p>
        ) : target?.targetPath ? (
          <PathText path={target.targetPath} />
        ) : isBlocked ? (
          <p className="truncate text-xs text-danger">{t("library.agents.blockedNote")}</p>
        ) : (
          <p className="truncate text-xs text-muted-foreground">
            {sharedWith > 0
              ? t("library.agents.sharedFolder", { count: sharedWith })
              : t("library.agents.notDeployed")}
          </p>
        )}
        <AgentFieldNote skill={skill} agentKey={agent.key} agentName={agent.displayName} />
      </div>
      {pending ? <Spinner className="size-3.5 text-muted-foreground" /> : null}
      <Switch
        checked={deployed}
        // An unavailable or blocked agent can still be cleaned up, but never deployed to.
        disabled={pending || ((Boolean(unavailableReason) || blocked) && !deployed)}
        aria-label={t(deployed ? "agentBadges.deployedTo" : "agentBadges.notDeployedTo", {
          agent: agent.displayName,
        })}
        onCheckedChange={(next) => {
          setToggling(true);
          // A failure is toasted by the mutation itself.
          void toggle(skill, agent, next)
            .catch(() => undefined)
            .finally(() => setToggling(false));
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            size="icon-xs"
            label={t("library.agents.rowMenu", { agent: agent.displayName })}
            icon={<MoreHorizontal />}
            disabled={pending}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() =>
              setBlocked.mutate({ skillId: skill.id, agentKeys: [agent.key], blocked: !blocked })
            }
          >
            {t(
              blocked
                ? "library.agents.allow"
                : deployed
                  ? "library.agents.blockAndRemove"
                  : "library.agents.block",
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/** Every agent with a switch: available ones first, the rest folded away with the reason. */
export function AgentsTab({ skill }: { skill: Skill }): ReactNode {
  const { t } = useTranslation();
  const agents = useAgents();
  const apply = useApplySkills();
  const confirmUndeploy = useConfirmUndeploy();
  const toggle = useAgentToggle();
  const [showUnavailable, setShowUnavailable] = useState(false);
  const { deployed: deployedKeys, blocked: blockedKeys } = useSkillAgentKeys(skill);

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
  // "Deploy to all" skips blocked agents, so it has nothing to do once the rest have the skill.
  const deployable = available.filter(
    (agent) => !deployedKeys.has(agent.key) && !blockedKeys.has(agent.key),
  ).length;

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

  /** Like each switch: a copy edited in an agent's folder is asked about before it goes. */
  const removeAll = async (): Promise<void> => {
    for (const agent of available) {
      const deployment = skill.deployments.find((entry) => entry.agentKey === agent.key);
      if (deployment?.mode !== "copy") continue;
      const go = await confirmUndeploy({
        skillId: skill.id,
        name: skill.name,
        agentKey: agent.key,
        agentName: agent.displayName,
        copy: true,
      });
      if (!go) return;
    }
    applyAll("remove");
  };

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
              disabled={apply.isPending || deployable === 0}
              onClick={() => applyAll("add")}
            >
              {t("library.agents.deployAll")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={apply.isPending || deployedCount === 0}
              onClick={() => void removeAll()}
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
              blocked={blockedKeys.has(agent.key)}
              toggle={toggle}
            />
          ))}
        </ul>
      </PageSection>

      {unavailable.length > 0 ? (
        <Collapsible open={showUnavailable} onOpenChange={setShowUnavailable}>
          <CollapsibleTrigger
            className={cn(
              SECTION_LABEL,
              "group/unavailable flex items-center gap-1.5 rounded hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            )}
          >
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
                  blocked={blockedKeys.has(agent.key)}
                  toggle={toggle}
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
