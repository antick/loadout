import type { AgentInfo, BackupStatus, Project, Skill } from "@skillboard/shared";
import { useNavigate } from "@tanstack/react-router";
import { ArrowUpCircle, Bot, CloudUpload, FolderKanban, Layers, Library } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { StatCard } from "@/components/StatCard";
import type { StatusTone } from "@/components/StatusBadge";
import { isAgentAvailable } from "@/hooks/queries/agents";
import { type BackupModeKind, deriveBackupMode } from "@/lib/backup-mode";
import { PERCENT } from "./constants";

const BACKUP_TONES: Record<BackupModeKind, StatusTone> = {
  loading: "neutral",
  git_missing: "danger",
  not_set_up: "neutral",
  needs_remote: "neutral",
  needs_fix: "danger",
  failed: "danger",
  pending: "warning",
  up_to_date: "success",
};

export interface DashboardStatsProps {
  skills: readonly Skill[];
  agents: readonly AgentInfo[];
  projects: readonly Project[];
  backup: BackupStatus | undefined;
}

/** A thin bar for "how much of the library is installed somewhere". Spans, so it fits a hint. */
function CoverageBar({ percent }: { percent: number }): ReactNode {
  return (
    <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-muted">
      <span
        className="block h-full rounded-full bg-primary transition-[width] duration-200"
        style={{ width: `${percent}%` }}
      />
    </span>
  );
}

/** The six numbers at the top of the dashboard. Each card opens the page behind its number. */
export function DashboardStats({
  skills,
  agents,
  projects,
  backup,
}: DashboardStatsProps): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const deployed = skills.filter((skill) => skill.deployments.length > 0).length;
  const coverage = skills.length > 0 ? Math.round((deployed / skills.length) * PERCENT) : 0;
  const connected = agents.filter(isAgentAvailable).length;
  const updates = skills.filter((skill) => skill.updateStatus === "update_available").length;
  const diverged = projects.filter((project) => project.syncHealth.diverged > 0).length;
  const backupKind = deriveBackupMode(backup, null, null).kind;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
      <StatCard
        label={t("dashboard.stats.skills")}
        value={skills.length}
        icon={Library}
        tone="primary"
        onClick={() => void navigate({ to: "/library" })}
      />
      <StatCard
        label={t("dashboard.stats.coverage")}
        value={t("dashboard.stats.percent", { value: coverage })}
        icon={Layers}
        hint={
          <>
            {t("dashboard.stats.coverageHint", { deployed, total: skills.length })}
            <CoverageBar percent={coverage} />
          </>
        }
        onClick={() => void navigate({ to: "/library" })}
      />
      <StatCard
        label={t("dashboard.stats.agents")}
        value={connected}
        icon={Bot}
        hint={t("dashboard.stats.agentsHint", { count: agents.length })}
        onClick={() => void navigate({ to: "/agents" })}
      />
      <StatCard
        label={t("dashboard.stats.updates")}
        value={updates}
        icon={ArrowUpCircle}
        tone={updates > 0 ? "info" : "neutral"}
        hint={t(updates > 0 ? "dashboard.stats.updatesHint" : "dashboard.stats.updatesNone")}
        onClick={() => void navigate({ to: "/library" })}
      />
      <StatCard
        label={t("dashboard.stats.projects")}
        value={projects.length}
        icon={FolderKanban}
        tone={diverged > 0 ? "warning" : "neutral"}
        hint={
          diverged > 0 ? (
            <span className="text-warning">
              {t("dashboard.stats.projectsDiverged", { count: diverged })}
            </span>
          ) : undefined
        }
      />
      <StatCard
        label={t("dashboard.stats.backup")}
        value={<span className="text-base">{t(`dashboard.backupState.${backupKind}`)}</span>}
        icon={CloudUpload}
        tone={BACKUP_TONES[backupKind]}
        onClick={() => void navigate({ to: "/backup" })}
      />
    </div>
  );
}
