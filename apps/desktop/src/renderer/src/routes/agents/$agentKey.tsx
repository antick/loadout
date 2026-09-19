import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";
import { useAgents } from "@/hooks/queries/agents";

function AgentRoute(): ReactNode {
  const { t } = useTranslation();
  const { agentKey } = Route.useParams();
  const agent = useAgents().data?.find((entry) => entry.key === agentKey);
  return (
    <PagePlaceholder
      title={agent?.displayName ?? agentKey}
      breadcrumbs={[{ label: t("nav.agents"), to: "/agents" }]}
    />
  );
}

export const Route = createFileRoute("/agents/$agentKey")({ component: AgentRoute });
