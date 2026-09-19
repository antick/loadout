import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { useSetupAgentControl } from "@/hooks/mutations/dashboard";
import { useAvailableAgents } from "@/hooks/queries/agents";
import { cn } from "@/lib/utils";

export interface AgentControlSetupProps {
  /** Called once the skill is installed and deployed. */
  onDone?: () => void;
  /** Extra button next to "Set up", e.g. "Not now". */
  secondaryAction?: ReactNode;
  className?: string;
}

/**
 * Pick the agents that should learn to drive the command-line tool, then install the bundled
 * skill for them. Nothing is pre-selected: the user decides which agents may manage skills.
 */
export function AgentControlSetup({
  onDone,
  secondaryAction,
  className,
}: AgentControlSetupProps): ReactNode {
  const { t } = useTranslation();
  const agents = useAvailableAgents();
  const setup = useSetupAgentControl();
  const [selected, setSelected] = useState<readonly string[]>([]);

  const toggle = (key: string, on: boolean): void =>
    setSelected((current) => (on ? [...current, key] : current.filter((k) => k !== key)));

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {agents.data && agents.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("agentControl.noAgents")}</p>
      ) : (
        <ul className="flex flex-wrap gap-2" aria-label={t("agentControl.pickLabel")}>
          {agents.data?.map((agent) => {
            const checked = selected.includes(agent.key);
            return (
              <li key={agent.key}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors duration-150 hover:border-primary/40 hover:bg-accent/40",
                    checked && "border-primary/50 bg-primary/10",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    disabled={setup.isPending}
                    onCheckedChange={(value) => toggle(agent.key, value === true)}
                  />
                  <AgentAvatar agentKey={agent.key} name={agent.displayName} size="sm" />
                  {agent.displayName}
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={selected.length === 0 || setup.isPending}
          onClick={() => setup.mutate([...selected], { onSuccess: onDone })}
        >
          {setup.isPending ? <Spinner /> : null}
          {t("agentControl.setUp", { count: selected.length })}
        </Button>
        {secondaryAction}
      </div>
    </div>
  );
}
