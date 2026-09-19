import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { type StatusTone, TONE_CLASSES } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";

export interface ShellBannerProps {
  tone: StatusTone;
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}

/** Full-width notice under the top bar. Base of the crash and library warning banners. */
export function ShellBanner({
  tone,
  icon: Icon,
  title,
  description,
  actions,
}: ShellBannerProps): ReactNode {
  return (
    <output
      className={cn("flex items-center gap-3 border-b px-6 py-2 text-sm", TONE_CLASSES[tone])}
    >
      <Icon className="size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <span className="font-medium">{title}</span>
        {description ? (
          <span data-selectable className="ml-2 text-foreground/80">
            {description}
          </span>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-1 text-foreground">{actions}</div>
      ) : null}
    </output>
  );
}
