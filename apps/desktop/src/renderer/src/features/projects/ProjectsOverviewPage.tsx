import type { Project, SyncStatus } from "@loadout/shared";
import { FolderKanban, FolderPlus, FolderX } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { PageHeader } from "@/components/layout/PageHeader";
import { useShell } from "@/components/layout/shell-context";
import { CARD_GRID_CLASS, CardGridSkeleton, LinkCard } from "@/components/LinkCard";
import { PathText } from "@/components/PathText";
import { SKILL_ITEM_RAISED_CLASS } from "@/components/skill-item";
import { StatusBadge } from "@/components/StatusBadge";
import { SYNC_STATUS_META } from "@/components/SyncStatusBadge";
import { Button } from "@/components/ui/button";
import { useProjects } from "@/hooks/queries/projects";

const STATUS_ORDER = Object.keys(SYNC_STATUS_META) as SyncStatus[];

/** How the project's skills compare with the library, one badge per state that has any. */
function HealthBadges({ project }: { project: Project }): ReactNode {
  const { t } = useTranslation();
  if (project.missing) {
    return (
      <StatusBadge tone="danger" icon={<FolderX />} label={t("projectPage.overview.missing")} />
    );
  }
  const present = STATUS_ORDER.filter((status) => project.syncHealth[status] > 0);
  if (present.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {present.map((status) => {
        const { tone, icon: Icon } = SYNC_STATUS_META[status];
        return (
          <StatusBadge
            key={status}
            tone={tone}
            icon={<Icon />}
            label={`${project.syncHealth[status]} ${t(`syncStatus.${status}`)}`}
          />
        );
      })}
    </div>
  );
}

function ProjectCard({ project }: { project: Project }): ReactNode {
  const { t } = useTranslation();
  return (
    <LinkCard
      link={{ to: "/projects/$projectId", params: { projectId: project.id } }}
      label={t("projectPage.overview.open", { name: project.name })}
    >
      <div className="min-w-0">
        <h3 className="truncate text-sm font-medium">{project.name}</h3>
        <p className="text-xs text-muted-foreground tabular-nums">
          {t("projectPage.skillCount", { count: project.skillCount })}
        </p>
      </div>
      <PathText path={project.path} className={SKILL_ITEM_RAISED_CLASS} />
      <HealthBadges project={project} />
    </LinkCard>
  );
}

/** Every linked project as a card, with how its skills compare. The Projects section lands here. */
export function ProjectsOverviewPage(): ReactNode {
  const { t } = useTranslation();
  const shell = useShell();
  const projects = useProjects();

  return (
    <div className="flex min-h-full flex-col gap-6 px-6 py-5">
      <PageHeader
        title={t("projectPage.overview.title")}
        subtitle={
          projects.data?.length
            ? t("projectPage.overview.subtitle", { count: projects.data.length })
            : undefined
        }
        actions={
          <Button size="sm" onClick={shell.openAddProject}>
            <FolderPlus />
            {t("projects.link")}
          </Button>
        }
      />
      {projects.isPending ? (
        <CardGridSkeleton />
      ) : projects.error ? (
        <ErrorState
          error={projects.error}
          onRetry={() => void projects.refetch()}
          className="flex-1"
        />
      ) : projects.data.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={t("projectPage.overview.emptyTitle")}
          description={t("projectPage.overview.emptyDescription")}
          action={{ label: t("projects.link"), icon: FolderPlus, onClick: shell.openAddProject }}
          className="flex-1"
        />
      ) : (
        <div className={CARD_GRID_CLASS}>
          {projects.data.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
