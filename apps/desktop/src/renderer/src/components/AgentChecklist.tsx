import type { Skill } from "@loadout/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { missingCount } from "@/components/agent-checklist";
import { Skeletons } from "@/components/Skeletons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAvailableAgents } from "@/hooks/queries/agents";
import { SECTION_LABEL } from "@/lib/styles";
import { cn } from "@/lib/utils";

const SKELETON_ROWS = 3;

export interface AgentChecklistProps {
  /** The skills to deploy: each row says how many of them the agent may still get. */
  skills: readonly Skill[];
  chosen: ReadonlySet<string>;
  onChange: (chosen: ReadonlySet<string>) => void;
  /** Sizes the scrolling list. */
  listClassName?: string;
}

/** The available agents to tick for a deploy, with select all or none. */
export function AgentChecklist({
  skills,
  chosen,
  onChange,
  listClassName,
}: AgentChecklistProps): ReactNode {
  const { t } = useTranslation();
  const agents = useAvailableAgents();
  const list = agents.data ?? [];
  const allChosen = list.length > 0 && chosen.size === list.length;

  const toggle = (agentKey: string): void => {
    const next = new Set(chosen);
    if (!next.delete(agentKey)) next.add(agentKey);
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className={SECTION_LABEL}>{t("batchDeploy.agents")}</p>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={list.length === 0}
          onClick={() => onChange(new Set(allChosen ? [] : list.map((agent) => agent.key)))}
        >
          {t(allChosen ? "selection.selectNone" : "selection.selectAll")}
        </Button>
      </div>

      {agents.isPending ? (
        <div className="flex flex-col gap-1">
          <Skeletons count={SKELETON_ROWS} className="h-10 w-full" />
        </div>
      ) : list.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          {t("batchDeploy.noAgents")}
        </p>
      ) : (
        <ul className={cn("-mx-1 flex flex-col gap-0.5 overflow-y-auto px-1", listClassName)}>
          {list.map((agent) => {
            const missing = missingCount(skills, agent.key);
            const checked = chosen.has(agent.key);
            return (
              <li key={agent.key}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/60",
                    checked && "bg-primary/5",
                  )}
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggle(agent.key)} />
                  <AgentAvatar agentKey={agent.key} name={agent.displayName} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">{agent.displayName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {missing === 0
                      ? t("batchDeploy.hasAll")
                      : t("batchDeploy.missing", { count: missing })}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
