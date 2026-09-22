import type { SkillLocation } from "@loadout/shared";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SkillEditorPage } from "@/features/editor/SkillEditorPage";
import { useAgents } from "@/hooks/queries/agents";
import { originLink } from "@/lib/skill-location";

export interface AgentSkillEditorSearch {
  /** The skill folder, relative to the agent's skills folder. */
  skill: string;
  file?: string;
}

/** Edit a skill that sits in an agent's global skills folder, where it is. */
function AgentSkillEditorRoute(): ReactNode {
  const { t } = useTranslation();
  const { agentKey } = Route.useParams();
  const { skill, file } = Route.useSearch();
  const navigate = Route.useNavigate();
  const agent = useAgents().data?.find((entry) => entry.key === agentKey);
  const location = useMemo<SkillLocation>(
    () => ({ kind: "agent", agentKey, relativePath: skill }),
    [agentKey, skill],
  );
  return (
    <SkillEditorPage
      location={location}
      file={file ?? null}
      onOpenFile={(path) =>
        void navigate({ search: (previous) => ({ ...previous, file: path }), replace: true })
      }
      crumbs={[
        { label: t("nav.agents"), to: "/agents" },
        { label: agent?.displayName ?? agentKey, to: "/agents/$agentKey", params: { agentKey } },
      ]}
      doneLink={originLink(location)}
    />
  );
}

export const Route = createFileRoute("/agents_/$agentKey/edit")({
  validateSearch: (search: Record<string, unknown>): AgentSkillEditorSearch => ({
    skill: typeof search.skill === "string" ? search.skill : "",
    file: typeof search.file === "string" && search.file ? search.file : undefined,
  }),
  component: AgentSkillEditorRoute,
});
