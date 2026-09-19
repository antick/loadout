import type { AgentInfo } from "@skillboard/shared";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { StatusBadge } from "@/components/StatusBadge";
import { buttonVariants } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/** Collapsed list of the agents that cannot receive skills right now, with the way to fix it. */
export function UnavailableAgents({ agents }: { agents: readonly AgentInfo[] }): ReactNode {
  const { t } = useTranslation();
  if (agents.length === 0) return null;
  return (
    <Collapsible className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 pr-3">
        <CollapsibleTrigger className="group/trigger flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[state=open]/trigger:rotate-90 motion-reduce:transition-none" />
          {t("agents.unavailable.title")}
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {agents.length}
          </span>
        </CollapsibleTrigger>
        <Link to="/settings" className={buttonVariants({ variant: "ghost", size: "xs" })}>
          {t("agents.unavailable.manage")}
        </Link>
      </div>
      <CollapsibleContent>
        <p className="px-3 pb-2 text-xs text-muted-foreground">{t("agents.unavailable.hint")}</p>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-x-4 border-t px-3 py-2">
          {agents.map((agent) => (
            <li key={agent.key} className="flex items-center gap-2 py-1.5">
              <AgentAvatar agentKey={agent.key} name={agent.displayName} size="sm" status="off" />
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {agent.displayName}
              </span>
              <StatusBadge
                tone="neutral"
                label={t(
                  agent.installed
                    ? "agents.unavailable.disabled"
                    : "agents.unavailable.notInstalled",
                )}
              />
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
