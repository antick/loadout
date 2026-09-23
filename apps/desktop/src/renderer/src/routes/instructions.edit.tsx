import type { SkillLocation } from "@loadout/shared";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { PageCrumb } from "@/components/layout/PageHeader";
import { SkillEditorPage } from "@/features/editor/SkillEditorPage";
import { useAgents } from "@/hooks/queries/agents";
import { useProjects } from "@/hooks/queries/projects";
import { originLink } from "@/lib/skill-location";

export interface InstructionsEditorSearch {
  /** The agent whose instruction file is edited; agents sharing the file get the same edit. */
  agent: string;
  /** The project, for a project's file; global when missing. */
  project?: string;
  file?: string;
}

/** Edit an agent's instruction file (`CLAUDE.md`, `AGENTS.md`, …), global or in a project. */
function InstructionsEditorRoute(): ReactNode {
  const { t } = useTranslation();
  const { agent, project, file } = Route.useSearch();
  const navigate = Route.useNavigate();
  const agentName = useAgents().data?.find((entry) => entry.key === agent)?.displayName;
  const projectName = useProjects().data?.find((entry) => entry.id === project)?.name;
  const location = useMemo<SkillLocation>(
    () => ({ kind: "instructions", agentKey: agent, projectId: project ?? null }),
    [agent, project],
  );
  const crumbs: PageCrumb[] = project
    ? [
        {
          label: projectName ?? t("nav.projects"),
          to: "/projects/$projectId",
          params: { projectId: project },
        },
      ]
    : [
        { label: t("nav.agents"), to: "/agents" },
        { label: agentName ?? agent, to: "/agents/$agentKey", params: { agentKey: agent } },
      ];
  return (
    <SkillEditorPage
      location={location}
      file={file ?? null}
      onOpenFile={(path) =>
        void navigate({ search: (previous) => ({ ...previous, file: path }), replace: true })
      }
      crumbs={crumbs}
      doneLink={originLink(location)}
      title={t("instructions.editorTitle")}
    />
  );
}

export const Route = createFileRoute("/instructions/edit")({
  validateSearch: (search: Record<string, unknown>): InstructionsEditorSearch => ({
    agent: typeof search.agent === "string" ? search.agent : "",
    project: typeof search.project === "string" && search.project ? search.project : undefined,
    file: typeof search.file === "string" && search.file ? search.file : undefined,
  }),
  component: InstructionsEditorRoute,
});
