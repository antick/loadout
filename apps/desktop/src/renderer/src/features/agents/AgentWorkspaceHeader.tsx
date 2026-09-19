import type { AgentInfo } from "@skillboard/shared";
import { Share2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { PathText } from "@/components/PathText";
import { Skeleton } from "@/components/ui/skeleton";
import type { AgentFolderSummary } from "./agent-skill-rules";

export interface AgentWorkspaceHeaderProps {
  agent: AgentInfo;
  /** Undefined while the folder is being read. */
  summary: AgentFolderSummary | undefined;
  sharedWith: readonly string[];
}

/** Who this is, where its skills live, and how much of the folder the app manages. */
export function AgentWorkspaceHeader({
  agent,
  summary,
  sharedWith,
}: AgentWorkspaceHeaderProps): ReactNode {
  const { t } = useTranslation();
  return (
    <header className="flex items-center gap-4">
      <AgentAvatar agentKey={agent.key} name={agent.displayName} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <PathText path={agent.skillsDir} />
        {summary ? (
          <p className="text-sm text-muted-foreground tabular-nums">
            {t("agents.workspace.summary", {
              total: t("agents.skillCount", { count: summary.total }),
              managed: summary.managed,
              inSync: summary.inSync,
            })}
          </p>
        ) : (
          <Skeleton className="h-4 w-56" />
        )}
        {sharedWith.length > 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Share2 className="size-3 shrink-0" />
            {t("agents.sharedFolder", { agents: sharedWith.join(", ") })}
          </p>
        ) : null}
      </div>
    </header>
  );
}
