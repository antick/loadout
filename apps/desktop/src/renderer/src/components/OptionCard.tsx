import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { type StatusTone, TONE_CLASSES } from "@/components/StatusBadge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export interface OptionCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Small technical note under the description, e.g. accepted file types. Shown in mono. */
  hint?: string;
  tone?: StatusTone;
  onClick: () => void;
  disabled?: boolean;
  /** Swaps the icon for a spinner while the card's action is starting. */
  busy?: boolean;
  className?: string;
}

/** A large clickable choice: icon, title, one or two sentences. For "pick one way to start" rows. */
export function OptionCard({
  icon: Icon,
  title,
  description,
  hint,
  tone = "primary",
  onClick,
  disabled,
  busy,
  className,
}: OptionCardProps): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={cn(
        "flex min-h-36 flex-col items-start gap-3 rounded-lg border bg-card p-4 text-left transition-colors duration-150",
        "hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-60",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-md",
          TONE_CLASSES[tone],
        )}
      >
        {busy ? <Spinner className="size-4" /> : <Icon className="size-4" />}
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs leading-5 text-muted-foreground">{description}</span>
        {hint ? <span className="font-mono text-xs text-muted-foreground/80">{hint}</span> : null}
      </span>
    </button>
  );
}
