import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState } from "@/components/ErrorState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { isAgentAvailable, useAgents } from "@/hooks/queries/agents";
import { useBackupStatus } from "@/hooks/queries/app";
import { usePresets } from "@/hooks/queries/presets";
import { useProjects } from "@/hooks/queries/projects";
import { useSkills } from "@/hooks/queries/skills";
import { AgentControlCard } from "./AgentControlCard";
import { EVENING_HOUR, NOON_HOUR } from "./constants";
import { DashboardStats } from "./DashboardStats";
import { GettingStarted } from "./GettingStarted";
import { QuickActions } from "./QuickActions";
import { RecentActivity } from "./RecentActivity";
import { RecentSkills } from "./RecentSkills";

const STAT_SKELETONS = 6;

function greetingKey(hour: number): string {
  if (hour < NOON_HOUR) return "dashboard.greeting.morning";
  return hour < EVENING_HOUR ? "dashboard.greeting.afternoon" : "dashboard.greeting.evening";
}

/** The home screen: how the library is doing, shortcuts, and what happened lately. */
export function DashboardPage(): ReactNode {
  const { t } = useTranslation();
  const skills = useSkills();
  const agents = useAgents();
  const projects = useProjects();
  const presets = usePresets();
  const backup = useBackupStatus();

  if (skills.isError) {
    return (
      <>
        <PageHeader title={t("nav.dashboard")} />
        <ErrorState error={skills.error} onRetry={() => void skills.refetch()} />
      </>
    );
  }

  const skillList = skills.data ?? [];
  const agentList = agents.data ?? [];
  const empty = skills.isSuccess && skillList.length === 0;

  return (
    <div className="flex flex-col gap-6 px-6 py-5">
      <PageHeader title={t("nav.dashboard")} />
      <header>
        <p className="text-lg font-semibold tracking-tight">
          {t(greetingKey(new Date().getHours()))}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {empty
            ? t("dashboard.summaryEmpty")
            : [
                t("dashboard.summary.skills", { count: skillList.length }),
                t("dashboard.summary.agents", {
                  count: agentList.filter(isAgentAvailable).length,
                }),
                t("dashboard.summary.presets", { count: presets.data?.length ?? 0 }),
                t("dashboard.summary.projects", { count: projects.data?.length ?? 0 }),
              ].join(" · ")}
        </p>
      </header>

      <AgentControlCard />

      {skills.isPending ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
          {Array.from({ length: STAT_SKELETONS }, (_, index) => (
            <Skeleton key={index} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : empty ? (
        <GettingStarted />
      ) : (
        <>
          <DashboardStats
            skills={skillList}
            agents={agentList}
            projects={projects.data ?? []}
            backup={backup.data}
          />
          <QuickActions backup={backup.data} />
          <div className="grid gap-6 xl:grid-cols-2">
            <RecentActivity />
            <RecentSkills skills={skillList} />
          </div>
        </>
      )}
    </div>
  );
}
