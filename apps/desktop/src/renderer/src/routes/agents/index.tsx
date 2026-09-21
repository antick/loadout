import type { AgentCategory } from "@loadout/shared";
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  AGENT_CATEGORIES,
  AgentsOverviewPage,
  DEFAULT_AGENT_CATEGORY,
} from "@/features/agents/AgentsOverviewPage";

export interface AgentsSearch {
  category?: AgentCategory;
}

function AgentsRoute(): ReactNode {
  const { category } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <AgentsOverviewPage
      category={category ?? DEFAULT_AGENT_CATEGORY}
      onCategoryChange={(next) =>
        void navigate({
          search: { category: next === DEFAULT_AGENT_CATEGORY ? undefined : next },
          replace: true,
        })
      }
    />
  );
}

export const Route = createFileRoute("/agents/")({
  validateSearch: (search: Record<string, unknown>): AgentsSearch => ({
    category: AGENT_CATEGORIES.find((category) => category === search.category),
  }),
  component: AgentsRoute,
});
