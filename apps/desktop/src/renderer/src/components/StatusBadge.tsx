import type { ReactNode } from "react";
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
  /** Icon only; the label moves to `title` and `aria-label`. */
  compact?: boolean;
  className?: string;
}

/** Small semantic chip. The base of every status, source and update badge. */
export function StatusBadge({
  tone,
  label,
  icon,
  compact,
  className,
}: StatusBadgeProps): ReactNode {
  return (
    <span
      title={compact ? label : undefined}
      aria-label={compact ? label : undefined}
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {icon}
      {compact ? null : label}
    </span>
  );
}
