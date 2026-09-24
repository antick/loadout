import type { AgentInfo } from "@loadout/shared";
import { ChevronRight, RefreshCw } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { ErrorState } from "@/components/ErrorState";
import { SearchInput } from "@/components/SearchInput";
import { SortableList } from "@/components/SortableList";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { useSetAgentOrder, useSetAllAgentsEnabled } from "@/hooks/mutations/settings-page";
import { useAgents } from "@/hooks/queries/agents";
import { useSkills } from "@/hooks/queries/skills";
import { matchesQuery, moveId } from "@/lib/utils";
import { AddCustomAgentForm } from "./AddCustomAgentForm";
import { AgentCard } from "./AgentCard";
import { groupAgents, mergeGroupOrder } from "./agent-groups";
import { AGENT_GROUP_IDS, type AgentGroupId } from "./constants";

const SKELETON_CARDS = 4;
/** Groups that start collapsed: the long list of agents that are not on this machine. */
const COLLAPSED_BY_DEFAULT: ReadonlySet<AgentGroupId> = new Set(["other"]);

/** `SortableList` wants an `id`; agents are identified by `key`. */
interface SortableAgent {
  id: string;
  agent: AgentInfo;
}

function Counter({ label, value }: { label: string; value: number }): ReactNode {
  return (
    <div className="rounded-lg border bg-card px-4 py-2.5">
      <p className="type-display text-2xl tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/** Every agent the app knows: switch them on and off, reorder them, point them at other folders. */
export function AgentsSection(): ReactNode {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const agents = useAgents();
  const skills = useSkills();
  const setAll = useSetAllAgentsEnabled();
  const setOrder = useSetAgentOrder();
  const [filter, setFilter] = useState("");
  const [openGroups, setOpenGroups] = useState<Partial<Record<AgentGroupId, boolean>>>({});

  const list = useMemo(() => agents.data ?? [], [agents.data]);
  const groups = useMemo(() => groupAgents(list), [list]);
  const namesByKey = useMemo(
    () => new Map(list.map((agent) => [agent.key, agent.displayName])),
    [list],
  );
  const deployedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const skill of skills.data ?? []) {
      for (const { agentKey } of skill.deployments) {
        counts.set(agentKey, (counts.get(agentKey) ?? 0) + 1);
      }
    }
    return counts;
  }, [skills.data]);

  if (agents.isError) {
    return <ErrorState error={agents.error} onRetry={() => void agents.refetch()} />;
  }

  const reorderGroup = (groupKeys: string[]): void =>
    setOrder.mutate(
      mergeGroupOrder(
        list.map((agent) => agent.key),
        groupKeys,
      ),
    );

  const disableAll = async (): Promise<void> => {
    const confirmed = await confirm({
      title: t("settings.agents.disableAllTitle"),
      description: t("settings.agents.disableAllBody"),
      confirmLabel: t("settings.agents.disableAll"),
      destructive: true,
    });
    if (confirmed) setAll.mutate(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid flex-1 grid-cols-3 gap-3">
          <Counter label={t("settings.agents.count.detected")} value={groups.detected.length} />
          <Counter
            label={t("settings.agents.count.enabled")}
            value={list.filter((agent) => agent.installed && agent.enabled).length}
          />
          <Counter label={t("settings.agents.count.custom")} value={groups.custom.length} />
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={setAll.isPending}
            onClick={() => setAll.mutate(true)}
          >
            {t("settings.agents.enableAll")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={setAll.isPending}
            onClick={() => void disableAll()}
          >
            {t("settings.agents.disableAll")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={agents.isFetching}
            onClick={() => void agents.refetch()}
          >
            <RefreshCw className={agents.isFetching ? "animate-spin" : undefined} />
            {t("settings.agents.refresh")}
          </Button>
        </div>
      </div>

      {agents.isPending ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: SKELETON_CARDS }, (_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        AGENT_GROUP_IDS.map((groupId) => {
          const members = groups[groupId];
          if (members.length === 0) return null;
          const filterable = groupId === "other";
          const query = filterable ? filter : "";
          const visible: SortableAgent[] = members
            .filter((agent) => matchesQuery(query, agent.displayName, agent.key))
            .map((agent) => ({ id: agent.key, agent }));
          const memberKeys = members.map((agent) => agent.key);
          const canReorder = !query.trim() && members.length > 1;
          const open = openGroups[groupId] ?? !COLLAPSED_BY_DEFAULT.has(groupId);

          return (
            <Collapsible
              key={groupId}
              open={open}
              onOpenChange={(next) => setOpenGroups((state) => ({ ...state, [groupId]: next }))}
              className="group/agents flex flex-col gap-2"
            >
              <div className="flex min-h-8 items-center justify-between gap-3">
                <CollapsibleTrigger className="flex items-center gap-1.5 rounded text-xs font-medium tracking-wider text-muted-foreground uppercase hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  <ChevronRight className="size-3.5 transition-transform duration-150 group-data-[state=open]/agents:rotate-90" />
                  {t(`settings.agents.group.${groupId}`)}
                  <span className="tabular-nums">{members.length}</span>
                </CollapsibleTrigger>
                {filterable && open ? (
                  <SearchInput
                    value={filter}
                    onChange={setFilter}
                    focusHotkey={false}
                    placeholder={t("settings.agents.filter")}
                    className="w-56"
                  />
                ) : null}
              </div>
              <CollapsibleContent className="flex flex-col gap-2">
                {visible.length === 0 ? (
                  <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                    {t("settings.agents.noMatch")}
                  </p>
                ) : (
                  <SortableList
                    items={visible}
                    disabled={!canReorder}
                    onReorder={reorderGroup}
                    renderItem={({ agent }, index) => (
                      <AgentCard
                        agent={agent}
                        deployedCount={deployedCounts.get(agent.key) ?? 0}
                        namesByKey={namesByKey}
                        onMoveUp={
                          canReorder && index > 0
                            ? () => reorderGroup(moveId(memberKeys, agent.key, -1))
                            : undefined
                        }
                        onMoveDown={
                          canReorder && index < visible.length - 1
                            ? () => reorderGroup(moveId(memberKeys, agent.key, 1))
                            : undefined
                        }
                      />
                    )}
                  />
                )}
              </CollapsibleContent>
            </Collapsible>
          );
        })
      )}

      <AddCustomAgentForm />
    </div>
  );
}
