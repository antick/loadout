import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";
import { PathText } from "@/components/PathText";
import { useProjects } from "@/hooks/queries/projects";

function ProjectRoute(): ReactNode {
  const { t } = useTranslation();
  const { projectId } = Route.useParams();
  const project = useProjects().data?.find((entry) => entry.id === projectId);
  return (
    <PagePlaceholder
      title={project?.name ?? t("nav.projects")}
      subtitle={project ? <PathText path={project.path} /> : undefined}
    />
  );
}

export const Route = createFileRoute("/projects/$projectId")({ component: ProjectRoute });
