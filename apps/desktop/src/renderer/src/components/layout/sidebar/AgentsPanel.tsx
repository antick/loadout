import type { AgentInfo } from "@loadout/shared";
import { useNavigate } from "@tanstack/react-router";
import { Bot, SlidersHorizontal } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { NavGroup } from "@/components/layout/sidebar/NavGroup";
import { SidebarNavItem } from "@/components/layout/sidebar/SidebarNavItem";
import { SidebarPanel } from "@/components/layout/sidebar/SidebarPanel";
import { SidebarMenu, SidebarMenuItem, SidebarMenuSkeleton } from "@/components/ui/sidebar";
import { useAvailableAgents, useWorkspaceCounts } from "@/hooks/queries/agents";

const SKELETON_ROWS = [0, 1, 2];

function AgentItems({
  agents,
  counts,
}: {
  agents: readonly AgentInfo[];
  counts: Record<string, number> | undefined;
}): ReactNode {
  return agents.map((agent) => (
    <SidebarMenuItem key={agent.key}>
      <SidebarNavItem
        link={{ to: "/agents/$agentKey", params: { agentKey: agent.key } }}
        label={agent.displayName}
        icon={
          <AgentAvatar
            agentKey={agent.key}
            name={agent.displayName}
            size="sm"
            className="-mx-0.5"
          />
        }
        badge={counts?.[agent.key]}
        badgeOnHover
      />
    </SidebarMenuItem>
  ));
}

/**
 * Agents section of the sidebar: "All agents", then one entry per available coding agent, and
 * personal assistants in a group of their own when there are any.
 */
export function AgentsPanel(): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const agents = useAvailableAgents();
  const agentKeys = useMemo(() => (agents.data ?? []).map((agent) => agent.key), [agents.data]);
  const counts = useWorkspaceCounts(agentKeys);
  const coding = (agents.data ?? []).filter((agent) => agent.category === "coding");
  const assistants = (agents.data ?? []).filter((agent) => agent.category === "assistant");

  return (
    <SidebarPanel
      title={t("activityBar.agents")}
      action={{
        label: t("sidebar.agents.manage"),
        icon: <SlidersHorizontal />,
        onClick: () => void navigate({ to: "/settings", search: { section: "agents" } }),
      }}
    >
      <NavGroup id="agents" label={t("sidebar.agents.coding")}>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarNavItem
              link={{ to: "/agents" }}
              exact
              label={t("nav.allAgents")}
              icon={<Bot />}
            />
          </SidebarMenuItem>
          {agents.isPending ? (
            SKELETON_ROWS.map((row) => <SidebarMenuSkeleton key={row} showIcon />)
          ) : (
            <AgentItems agents={coding} counts={counts.data} />
          )}
        </SidebarMenu>
      </NavGroup>
      {assistants.length > 0 ? (
        <NavGroup id="assistants" label={t("nav.assistants")}>
          <SidebarMenu>
            <AgentItems agents={assistants} counts={counts.data} />
          </SidebarMenu>
        </NavGroup>
      ) : null}
    </SidebarPanel>
  );
}
