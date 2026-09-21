import type { AgentInfo } from "@loadout/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AGENT_BADGE_MAX_VISIBLE } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** What a badge needs to know. An `AgentInfo` fits, and so does a project target. */
export type BadgeAgent = Pick<AgentInfo, "key" | "displayName">;

export interface AgentBadgeRowProps<T extends BadgeAgent = AgentInfo> {
  /** Agents to show, normally the available ones. */
  agents: readonly T[];
  deployedKeys: ReadonlySet<string>;
  pendingKeys?: ReadonlySet<string>;
  /** Deployed agents whose copy needs attention; drawn with a warning ring. */
  warningKeys?: ReadonlySet<string>;
  /** Called with the state the user wants for that agent. Omit for a read-only row. */
  onToggle?: (agent: T, deploy: boolean) => void;
  maxVisible?: number;
  className?: string;
}

const FOCUS_RING = "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/** One avatar per agent showing deployed or not. Click to install or remove; extras go in "+N". */
export function AgentBadgeRow<T extends BadgeAgent = AgentInfo>({
  agents,
  deployedKeys,
  pendingKeys,
  warningKeys,
  onToggle,
  maxVisible = AGENT_BADGE_MAX_VISIBLE,
  className,
}: AgentBadgeRowProps<T>): ReactNode {
  const { t } = useTranslation();
  if (agents.length === 0) return null;

  // Deployed agents first, so what matters stays out of the overflow.
  const ordered = [...agents].sort(
    (a, b) => Number(deployedKeys.has(b.key)) - Number(deployedKeys.has(a.key)),
  );
  const visible = ordered.slice(0, maxVisible);
  const overflow = ordered.slice(maxVisible);

  const badge = (agent: T, withName: boolean): ReactNode => {
    const deployed = deployedKeys.has(agent.key);
    const pending = pendingKeys?.has(agent.key) ?? false;
    const hint = t(deployed ? "agentBadges.clickToRemove" : "agentBadges.clickToInstall");
    const label = t(deployed ? "agentBadges.deployedTo" : "agentBadges.notDeployedTo", {
      agent: agent.displayName,
    });
    const avatar = pending ? (
      <span className="inline-flex size-5 items-center justify-center">
        <Spinner className="size-3.5" />
      </span>
    ) : (
      <AgentAvatar
        agentKey={agent.key}
        name={agent.displayName}
        size="sm"
        status={deployed ? (warningKeys?.has(agent.key) ? "warning" : undefined) : "off"}
      />
    );
    const button = (
      <button
        key={agent.key}
        type="button"
        disabled={!onToggle || pending}
        aria-pressed={deployed}
        aria-label={`${label}. ${hint}`}
        onClick={() => onToggle?.(agent, !deployed)}
        className={cn(
          "inline-flex items-center gap-2 rounded transition-opacity hover:opacity-100 disabled:cursor-default",
          withName && "w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
          FOCUS_RING,
        )}
      >
        {avatar}
        {withName ? (
          <span className={cn("truncate", !deployed && "text-muted-foreground")}>
            {agent.displayName}
          </span>
        ) : null}
      </button>
    );
    if (withName) return button;
    return (
      <Tooltip key={agent.key}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">{label}</p>
          {onToggle ? <p className="opacity-80">{hint}</p> : null}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <fieldset
      className={cn("flex min-w-0 items-center gap-1", className)}
      aria-label={t("agentBadges.groupLabel")}
    >
      {visible.map((agent) => badge(agent, false))}
      {overflow.length > 0 ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t("agentBadges.more", { count: overflow.length })}
              className={cn(
                "inline-flex h-5 items-center rounded bg-muted px-1 font-mono text-[0.625rem] text-muted-foreground hover:text-foreground",
                FOCUS_RING,
              )}
            >
              +{overflow.length}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="max-h-72 w-56 overflow-y-auto p-1">
            {overflow.map((agent) => badge(agent, true))}
          </PopoverContent>
        </Popover>
      ) : null}
    </fieldset>
  );
}
