import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { type StatusTone, TONE_CLASSES } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: StatusTone;
  /** Small line under the value. */
  hint?: ReactNode;
  /** Makes the whole card a button. */
  onClick?: () => void;
  className?: string;
}

/** One number with a label, for dashboards and summaries. */
export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  hint,
  onClick,
  className,
}: StatCardProps): ReactNode {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex items-start justify-between gap-3 rounded-lg border bg-card p-4 text-left",
        onClick &&
          "transition-colors duration-150 hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
        {hint ? <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {Icon ? (
        <span
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-md",
            TONE_CLASSES[tone],
          )}
        >
          <Icon className="size-4" />
        </span>
      ) : null}
    </Comp>
  );
}
