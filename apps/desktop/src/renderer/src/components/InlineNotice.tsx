import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { type StatusTone, TONE_CLASSES } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";

export interface InlineNoticeProps {
  tone: StatusTone;
  icon: LucideIcon;
  /** The message. Keep it to one or two sentences. */
  children: ReactNode;
  /** Buttons on the right, e.g. "View" and "Dismiss". */
  actions?: ReactNode;
  className?: string;
}

/**
 * Tinted notice inside a page or a dialog: update banners, one-line explanations, warnings.
 * `ShellBanner` is the full-width variant that sits under the top bar.
 */
export function InlineNotice({
  tone,
  icon: Icon,
  children,
  actions,
  className,
}: InlineNoticeProps): ReactNode {
  return (
    <output
      className={cn(
        "flex items-start gap-2.5 rounded-lg px-3 py-2 text-sm",
        TONE_CLASSES[tone],
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 text-foreground/90">{children}</div>
      {actions ? (
        <div className="-my-0.5 flex shrink-0 items-center gap-1 text-foreground">{actions}</div>
      ) : null}
    </output>
  );
}
