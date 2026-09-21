import type { AgentInfo } from "@loadout/shared";
import { Bot } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { NavGroup } from "@/components/layout/sidebar/NavGroup";
import { SidebarNavItem } from "@/components/layout/sidebar/SidebarNavItem";
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

/** "All agents" plus one entry per available agent; assistants get their own group when present. */
export function AgentsGroup(): ReactNode {
  const { t } = useTranslation();
  const agents = useAvailableAgents();
  const agentKeys = useMemo(() => (agents.data ?? []).map((agent) => agent.key), [agents.data]);
  const counts = useWorkspaceCounts(agentKeys);
  const coding = (agents.data ?? []).filter((agent) => agent.category === "coding");
  const assistants = (agents.data ?? []).filter((agent) => agent.category === "assistant");

  return (
    <>
      <NavGroup id="agents" label={t("nav.agents")}>
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
    </>
  );
}
