import type { ReactNode } from "react";
import { agentMonogram, agentTintStyle } from "@/lib/agent-color";
import { cn } from "@/lib/utils";

export type AgentAvatarSize = "sm" | "md" | "lg";
/** `on`: deployed / healthy, `off`: not deployed (dimmed), `warning`: needs attention. */
export type AgentAvatarStatus = "on" | "off" | "warning";

const SIZE_CLASSES: Record<AgentAvatarSize, string> = {
  sm: "size-5 rounded text-[0.5625rem]",
  md: "size-7 rounded-md text-[0.6875rem]",
  lg: "size-10 rounded-lg text-sm",
};

const STATUS_CLASSES: Record<AgentAvatarStatus, string> = {
  on: "ring-2 ring-success/70 ring-offset-1 ring-offset-background",
  off: "opacity-35 grayscale",
  warning: "ring-2 ring-warning/80 ring-offset-1 ring-offset-background",
};

export interface AgentAvatarProps {
  agentKey: string;
  name: string;
  size?: AgentAvatarSize;
  status?: AgentAvatarStatus;
  className?: string;
}

/** Monogram on a tint derived from the agent key. Stands in for a logo everywhere an agent appears. */
export function AgentAvatar({
  agentKey,
  name,
  size = "md",
  status,
  className,
}: AgentAvatarProps): ReactNode {
  return (
    <span
      aria-hidden="true"
      style={agentTintStyle(agentKey)}
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-mono font-semibold tracking-tight select-none",
        SIZE_CLASSES[size],
        status ? STATUS_CLASSES[status] : null,
        className,
      )}
    >
      {agentMonogram(name)}
    </span>
  );
}
