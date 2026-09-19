import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AgentWorkspacePage } from "@/features/agents/AgentWorkspacePage";

function AgentRoute(): ReactNode {
  const { agentKey } = Route.useParams();
  // Keyed so search, selection and the open sheet start fresh for every agent.
  return <AgentWorkspacePage key={agentKey} agentKey={agentKey} />;
}

export const Route = createFileRoute("/agents/$agentKey")({ component: AgentRoute });
