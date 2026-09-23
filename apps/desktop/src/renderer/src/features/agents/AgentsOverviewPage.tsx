import type { AgentCategory, AgentInfo } from "@loadout/shared";
import { useNavigate } from "@tanstack/react-router";
import { Bot, Settings2 } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { PageHeader } from "@/components/layout/PageHeader";
import { CARD_GRID_CLASS, CardGridSkeleton } from "@/components/LinkCard";
import { PageSection } from "@/components/PageSection";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isAgentAvailable, useAgents, useWorkspaceCounts } from "@/hooks/queries/agents";
import { useSkills } from "@/hooks/queries/skills";
import { AgentCard } from "./AgentCard";
import { AgentPresetBar } from "./AgentPresetBar";
import { UnavailableAgents } from "./UnavailableAgents";

export const AGENT_CATEGORIES: readonly AgentCategory[] = ["coding", "assistant"];
export const DEFAULT_AGENT_CATEGORY: AgentCategory = "coding";

export interface AgentsOverviewPageProps {
  category: AgentCategory;
  onCategoryChange: (category: AgentCategory) => void;
}

/** Every available agent as a card, with preset pills that act on all of the listed agents. */
export function AgentsOverviewPage({
  category,
  onCategoryChange,
}: AgentsOverviewPageProps): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const agents = useAgents();
  const skills = useSkills();

  const available = useMemo(() => (agents.data ?? []).filter(isAgentAvailable), [agents.data]);
  const unavailable = useMemo(
    () => (agents.data ?? []).filter((agent) => !isAgentAvailable(agent)),
    [agents.data],
  );
  const hasAssistants = available.some((agent) => agent.category === "assistant");
  // Without assistants there is nothing to switch between, so a stale choice must not hide agents.
  const shownCategory = hasAssistants ? category : DEFAULT_AGENT_CATEGORY;
  const listed = useMemo(
    () => available.filter((agent) => agent.category === shownCategory),
    [available, shownCategory],
  );
  const listedKeys = useMemo(() => listed.map((agent) => agent.key), [listed]);
  const counts = useWorkspaceCounts(listedKeys);

  const names = useMemo(
    () => new Map((agents.data ?? []).map((agent) => [agent.key, agent.displayName])),
    [agents.data],
  );

  /** Real on-disk count; when the scan fails, the number of library skills deployed there. */
  const countFor = (agent: AgentInfo): number | undefined => {
    const scanned = counts.data?.[agent.key];
    if (scanned !== undefined) return scanned;
    if (!counts.isError || !skills.data) return undefined;
    return skills.data.filter((skill) =>
      skill.deployments.some((entry) => entry.agentKey === agent.key),
    ).length;
  };

  const openSettings = (): void =>
    void navigate({ to: "/settings", search: { section: "agents" } });

  return (
    <div className="flex min-h-full flex-col gap-6 px-6 py-5">
      <PageHeader
        title={t("nav.allAgents")}
        subtitle={
          agents.data ? t("agents.overview.subtitle", { count: available.length }) : undefined
        }
      />

      {agents.isPending ? (
        <CardGridSkeleton />
      ) : agents.error ? (
        <ErrorState error={agents.error} onRetry={() => void agents.refetch()} className="flex-1" />
      ) : available.length === 0 ? (
        <EmptyState
          icon={Bot}
          title={t("agents.overview.emptyTitle")}
          description={t("agents.overview.emptyDescription")}
          action={{
            label: t("agents.overview.openSettings"),
            icon: Settings2,
            onClick: openSettings,
          }}
          className="flex-1"
        />
      ) : (
        <>
          {hasAssistants ? (
            <Tabs
              value={shownCategory}
              onValueChange={(next) => {
                const picked = AGENT_CATEGORIES.find((entry) => entry === next);
                if (picked) onCategoryChange(picked);
              }}
            >
              <TabsList>
                {AGENT_CATEGORIES.map((entry) => (
                  <TabsTrigger key={entry} value={entry}>
                    {t(`agents.category.${entry}`)}
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      {available.filter((agent) => agent.category === entry).length}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : null}

          <AgentPresetBar
            agentKeys={listedKeys}
            hint={t("agents.overview.presetsHint", { count: listed.length })}
          />

          <PageSection title={t(`agents.category.${shownCategory}`)}>
            <div className={CARD_GRID_CLASS}>
              {listed.map((agent) => (
                <AgentCard
                  key={agent.key}
                  agent={agent}
                  count={countFor(agent)}
                  sharedWith={agent.sharesDirWith.map((key) => names.get(key) ?? key)}
                />
              ))}
            </div>
          </PageSection>
        </>
      )}

      {agents.data ? <UnavailableAgents agents={unavailable} /> : null}
    </div>
  );
}
