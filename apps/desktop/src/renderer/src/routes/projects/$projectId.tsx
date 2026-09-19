import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ProjectPage } from "@/features/projects/ProjectPage";

function ProjectRoute(): ReactNode {
  const { projectId } = Route.useParams();
  // Keyed so search, selection and the open sheet start fresh for every project.
  return <ProjectPage key={projectId} projectId={projectId} />;
}

export const Route = createFileRoute("/projects/$projectId")({ component: ProjectRoute });
