import { type SkillUsage, formatRelative } from "@loadout/shared";
import { Activity } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export interface SkillUsageNoteProps {
  /** The skill's usage; none when no agent ran it. */
  usage: SkillUsage | undefined;
  className?: string;
}

/** "12 runs · 3 days ago", or "Never run", for a skill while usage tracking is on. */
export function SkillUsageNote({ usage, className }: SkillUsageNoteProps): ReactNode {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground tabular-nums",
        className,
      )}
    >
      <Activity className="size-3 shrink-0" aria-hidden />
      <span className="truncate">
        {usage
          ? t("usage.note", { count: usage.uses, when: formatRelative(usage.lastUsedAt) })
          : t("usage.never")}
      </span>
    </span>
  );
}
