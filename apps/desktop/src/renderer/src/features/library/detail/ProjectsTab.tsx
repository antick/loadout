import {
  type LocalSkill,
  type Project,
  SYNC_STATUS_SEVERITY,
  type Skill,
  type SyncStatus,
} from "@loadout/shared";
import { Link } from "@tanstack/react-router";
import { FolderGit2, FolderX, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { useConfirm } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { useShell } from "@/components/layout/shell-context";
import { PageSection } from "@/components/PageSection";
import { PathText } from "@/components/PathText";
import { StatusBadge } from "@/components/StatusBadge";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useExportSkillToProject, useRemoveSkillFromProject } from "@/hooks/mutations/library";
import { type ProjectSkillCopies, useSkillInProjects } from "@/hooks/queries/library";
import { useProjects } from "@/hooks/queries/projects";
import { errorMessage } from "@/lib/toast";

/** The copy that needs the most attention decides the badge of the whole project row. */
function worstStatus(copies: readonly LocalSkill[]): SyncStatus {
  return copies.reduce<SyncStatus>(
    (worst, copy) =>
      SYNC_STATUS_SEVERITY[copy.syncStatus] > SYNC_STATUS_SEVERITY[worst] ? copy.syncStatus : worst,
    "in_sync",
  );
}

function ProjectRow({ skill, entry }: { skill: Skill; entry: ProjectSkillCopies }): ReactNode {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const exportSkill = useExportSkillToProject();
  const removeSkill = useRemoveSkillFromProject();
  const { project, copies } = entry;
  const present = copies.length > 0;

  const askRemove = async (): Promise<void> => {
    const ok = await confirm({
      title: t("library.projects.removeTitle", { name: skill.name, project: project.name }),
      description: t("library.projects.removeDescription"),
      items: copies.map((copy) => copy.path),
      confirmLabel: t("library.projects.remove"),
      destructive: true,
    });
    if (!ok) return;
    removeSkill.mutate({
      skill,
      project,
      relativePaths: [...new Set(copies.map((copy) => copy.relativePath))],
    });
  };

  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <FolderGit2 className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <Link
          to="/projects/$projectId"
          params={{ projectId: project.id }}
          className="block truncate rounded text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {project.name}
        </Link>
        <PathText path={project.path} copy={false} />
      </div>
      {entry.isPending ? (
        <Skeleton className="h-5 w-20" />
      ) : entry.error ? (
        <span className="max-w-48 truncate text-xs text-danger" title={errorMessage(entry.error)}>
          {errorMessage(entry.error)}
        </span>
      ) : present ? (
        <>
          <span className="flex shrink-0 items-center gap-1">
            {copies.map((copy) => (
              <span key={`${copy.agentKey}:${copy.relativePath}`} title={copy.agentDisplayName}>
                <AgentAvatar
                  agentKey={copy.agentKey}
                  name={copy.agentDisplayName}
                  size="sm"
                  status={copy.enabled ? undefined : "off"}
                />
              </span>
            ))}
          </span>
          <SyncStatusBadge status={worstStatus(copies)} />
        </>
      ) : (
        <StatusBadge tone="neutral" label={t("library.projects.notPresent")} />
      )}
      {present ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={removeSkill.isPending}
          className="text-muted-foreground hover:text-danger"
          onClick={() => void askRemove()}
        >
          {removeSkill.isPending ? <Spinner /> : <Trash2 />}
          {t("library.projects.remove")}
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={entry.isPending || Boolean(entry.error) || exportSkill.isPending}
          onClick={() => exportSkill.mutate({ skill, project })}
        >
          {exportSkill.isPending ? <Spinner /> : <Plus />}
          {t("library.projects.add")}
        </Button>
      )}
    </li>
  );
}

function MissingProjectRow({ project }: { project: Project }): ReactNode {
  const { t } = useTranslation();
  return (
    <li className="flex items-center gap-3 px-3 py-2 opacity-70">
      <FolderX className="size-4 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{project.name}</p>
        <PathText path={project.path} copy={false} reveal={false} />
      </div>
      <StatusBadge tone="warning" label={t("projects.missing")} />
    </li>
  );
}

/** Linked projects and whether this skill is inside each one, with add and remove. */
export function ProjectsTab({ skill }: { skill: Skill }): ReactNode {
  const { t } = useTranslation();
  const shell = useShell();
  const projects = useProjects();
  const entries = useSkillInProjects(skill.id, projects.data ?? []);

  if (projects.isPending) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1].map((row) => (
          <Skeleton key={row} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (projects.isError) {
    return <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />;
  }
  if (projects.data.length === 0) {
    return (
      <EmptyState
        icon={FolderGit2}
        title={t("library.projects.emptyTitle")}
        description={t("library.projects.emptyDescription")}
        action={{ label: t("projects.link"), icon: Plus, onClick: shell.openAddProject }}
      />
    );
  }

  const usedIn = entries.filter((entry) => entry.copies.length > 0).length;
  const missing = projects.data.filter((project) => project.missing);

  return (
    <PageSection
      title={t("library.projects.title")}
      description={t("library.projects.summary", { count: usedIn, total: projects.data.length })}
    >
      <ul className="divide-y rounded-lg border bg-card">
        {entries.map((entry) => (
          <ProjectRow key={entry.project.id} skill={skill} entry={entry} />
        ))}
        {missing.map((project) => (
          <MissingProjectRow key={project.id} project={project} />
        ))}
      </ul>
    </PageSection>
  );
}
