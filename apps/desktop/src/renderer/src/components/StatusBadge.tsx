import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "primary" | "success" | "warning" | "info" | "danger" | "kit";

/** Token-backed text + tinted background per tone. Reuse for any semantic chip. */
export const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/15 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  info: "bg-info/15 text-info",
  danger: "bg-danger/15 text-danger",
  kit: "bg-kit/15 text-kit",
};

/** Solid dot colour per tone, for compact status dots. */
export const TONE_DOT_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-muted-foreground/50",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
  danger: "bg-danger",
  kit: "bg-kit",
};

export interface StatusBadgeProps {
  tone: StatusTone;
  label: string;
  icon?: ReactNode;
  /** Icon only; the label stays for screen readers and shows on hover. */
  compact?: boolean;
  /**
   * Explains the badge in a tooltip, on hover and on keyboard focus (the badge becomes
   * focusable). A compact badge's tooltip leads with its label.
   */
  hint?: ReactNode;
  /** Makes the badge a link; with a hint, the link carries the tooltip. */
  link?: LinkProps;
  /** On the outermost element: the link when there is one, otherwise the badge. */
  className?: string;
}

const FOCUS_RING = "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/** Small semantic chip. The base of every status, source and update badge. */
export function StatusBadge({
  tone,
  label,
  icon,
  compact,
  hint,
  link,
  className,
}: StatusBadgeProps): ReactNode {
  const chipClass = cn(
    "inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3",
    TONE_CLASSES[tone],
    !link && className,
  );
  const content = (
    <>
      {icon}
      {compact ? <span className="sr-only">{label}</span> : label}
    </>
  );
  // A hint needs something keyboard users can reach; a link already is that.
  const chip =
    hint && !link ? (
      <button type="button" className={cn(chipClass, "cursor-default", FOCUS_RING)}>
        {content}
      </button>
    ) : (
      // A native title only where no tooltip shows the label already, or both would appear.
      <span title={compact && !hint ? label : undefined} className={chipClass}>
        {content}
      </span>
    );
  const target = link ? (
    <Link {...link} className={cn("inline-flex rounded-md", FOCUS_RING, className)}>
      {chip}
    </Link>
  ) : (
    chip
  );
  if (!hint) return target;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{target}</TooltipTrigger>
      <TooltipContent className="max-w-72">
        {compact ? <p className="font-medium">{label}</p> : null}
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}
