import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useCallback } from "react";
import { ProjectPage } from "@/features/projects/ProjectPage";

export interface ProjectSearch {
  /** Relative path of a skill to open in the side panel once. */
  skill?: string;
}

function ProjectRoute(): ReactNode {
  const { projectId } = Route.useParams();
  const { skill } = Route.useSearch();
  const navigate = Route.useNavigate();
  const clearSkill = useCallback(() => void navigate({ search: {}, replace: true }), [navigate]);
  // Keyed so search, selection and the open sheet start fresh for every project.
  return (
    <ProjectPage
      key={projectId}
      projectId={projectId}
      requestedSkill={skill ?? null}
      onSkillOpened={clearSkill}
    />
  );
}

export const Route = createFileRoute("/projects/$projectId")({
  validateSearch: (search: Record<string, unknown>): ProjectSearch => ({
    skill: typeof search.skill === "string" && search.skill ? search.skill : undefined,
  }),
  component: ProjectRoute,
});
