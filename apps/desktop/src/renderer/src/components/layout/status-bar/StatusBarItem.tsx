import { Link, type LinkProps } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type StatusBarTone = "default" | "danger" | "warning" | "info";

const TONES: Record<StatusBarTone, string> = {
  default: "text-muted-foreground hover:text-foreground",
  danger: "text-danger",
  warning: "text-warning",
  info: "text-info",
};

/** Shared look of a status bar entry, for buttons that are not links (e.g. menu triggers). */
export const STATUS_BAR_ITEM_CLASS =
  "inline-flex h-5 shrink-0 items-center gap-1.5 rounded px-1.5 text-xs whitespace-nowrap transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none [&_svg]:size-3.5 [&_svg]:shrink-0";

export interface StatusBarItemProps {
  icon?: ReactNode;
  children: ReactNode;
  /** Explains the entry and what clicking it does. */
  hint: string;
  tone?: StatusBarTone;
  link?: LinkProps;
  onClick?: () => void;
}

/** One entry of the status bar: a small icon and a few words, opening where they point. */
export function StatusBarItem({
  icon,
  children,
  hint,
  tone = "default",
  link,
  onClick,
}: StatusBarItemProps): ReactNode {
  const className = cn(STATUS_BAR_ITEM_CLASS, TONES[tone]);
  const body = (
    <>
      {icon}
      <span>{children}</span>
    </>
  );
  const trigger: ComponentProps<typeof TooltipTrigger>["children"] = link ? (
    <Link {...link} draggable={false} className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side="top">{hint}</TooltipContent>
    </Tooltip>
  );
}
