import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState } from "@/components/ErrorState";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAgents } from "@/hooks/queries/agents";
import { useBackupStatus } from "@/hooks/queries/app";
import { useProjects } from "@/hooks/queries/projects";
import { useSkills } from "@/hooks/queries/skills";
import { AgentControlCard } from "./AgentControlCard";
import { EVENING_HOUR, NOON_HOUR } from "./constants";
import { DashboardStats } from "./DashboardStats";
import { GettingStarted } from "./GettingStarted";
import { RecentActivity } from "./RecentActivity";
import { SkillUseCard } from "./SkillUseCard";
import { Skeletons } from "@/components/Skeletons";

const STAT_SKELETONS = 6;

function greetingKey(hour: number): string {
  if (hour < NOON_HOUR) return "dashboard.greeting.morning";
  return hour < EVENING_HOUR ? "dashboard.greeting.afternoon" : "dashboard.greeting.evening";
}

/** The home screen: how the library is doing and what happened lately. */
export function DashboardPage(): ReactNode {
  const { t } = useTranslation();
  // Read once when the page opens: the greeting does not change while it is on screen.
  const [hour] = useState(() => new Date().getHours());
  const skills = useSkills();
  const agents = useAgents();
  const projects = useProjects();
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
      <p className="type-display text-2xl">{t(greetingKey(hour))}</p>

      <AgentControlCard />

      {skills.isPending ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
          <Skeletons count={STAT_SKELETONS} className="h-24 rounded-lg" />
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
          <div className="grid gap-6 xl:grid-cols-2">
            <RecentActivity />
            <SkillUseCard skills={skillList} />
          </div>
        </>
      )}
    </div>
  );
}
