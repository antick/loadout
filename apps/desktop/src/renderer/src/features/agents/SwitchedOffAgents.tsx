import type { AgentInfo } from "@loadout/shared";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { PageSection } from "@/components/PageSection";
import { buttonVariants } from "@/components/ui/button";

/** Installed agents that are switched off, and the way to Settings for every other agent. */
export function SwitchedOffAgents({ agents }: { agents: readonly AgentInfo[] }): ReactNode {
  const { t } = useTranslation();
  const manage = (
    <Link
      to="/settings"
      search={{ section: "agents" }}
      className={buttonVariants({ variant: "ghost", size: "xs" })}
    >
      {t("agents.switchedOff.manage")}
    </Link>
  );
  if (agents.length === 0) {
    return (
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {t("agents.switchedOff.others")}
        {manage}
      </p>
    );
  }
  return (
    <PageSection
      title={t("agents.switchedOff.title")}
      description={t("agents.switchedOff.hint")}
      actions={manage}
    >
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-x-4 rounded-lg border bg-card px-3 py-2">
        {agents.map((agent) => (
          <li key={agent.key} className="flex items-center gap-2 py-1.5">
            <AgentAvatar agentKey={agent.key} name={agent.displayName} size="sm" status="off" />
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {agent.displayName}
            </span>
          </li>
        ))}
      </ul>
    </PageSection>
  );
}
