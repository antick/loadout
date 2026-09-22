import type { SkillLocation } from "@loadout/shared";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SkillEditorPage } from "@/features/editor/SkillEditorPage";
import { useProjects } from "@/hooks/queries/projects";
import { originLink } from "@/lib/skill-location";

export interface ProjectSkillEditorSearch {
  /** The skill folder, relative to the agent's skills folder inside the project. */
  skill: string;
  /** Whose copy is edited. */
  agent: string;
  file?: string;
}

/** Edit one copy of a project skill where it is; the other copies can take the change too. */
function ProjectSkillEditorRoute(): ReactNode {
  const { t } = useTranslation();
  const { projectId } = Route.useParams();
  const { skill, agent, file } = Route.useSearch();
  const navigate = Route.useNavigate();
  const project = useProjects().data?.find((entry) => entry.id === projectId);
  const location = useMemo<SkillLocation>(
    () => ({ kind: "project", projectId, relativePath: skill, agentKey: agent }),
    [agent, projectId, skill],
  );
  return (
    <SkillEditorPage
      location={location}
      file={file ?? null}
      onOpenFile={(path) =>
        void navigate({ search: (previous) => ({ ...previous, file: path }), replace: true })
      }
      crumbs={[
        {
          label: project?.name ?? t("nav.projects"),
          to: "/projects/$projectId",
          params: { projectId },
        },
      ]}
      doneLink={originLink(location)}
    />
  );
}

export const Route = createFileRoute("/projects_/$projectId/edit")({
  validateSearch: (search: Record<string, unknown>): ProjectSkillEditorSearch => ({
    skill: typeof search.skill === "string" ? search.skill : "",
    agent: typeof search.agent === "string" ? search.agent : "",
    file: typeof search.file === "string" && search.file ? search.file : undefined,
  }),
  component: ProjectSkillEditorRoute,
});
