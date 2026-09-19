import { CircleSlash, Files } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "@/components/StatusBadge";
import { SyncStatusBadge } from "@/components/SyncStatusBadge";
import { cn } from "@/lib/utils";
import type { LocalSkillView } from "./local-skill-view";

/** Sync status, switched-off state, the caller's own chips and the file count, on one line. */
export function LocalSkillMeta({
  item,
  badges,
  className,
}: {
  item: LocalSkillView;
  badges?: ReactNode;
  className?: string;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}>
      <SyncStatusBadge status={item.syncStatus} />
      {item.enabledState === "none" ? (
        <StatusBadge tone="neutral" icon={<CircleSlash />} label={t("localSkills.disabled")} />
      ) : null}
      {item.enabledState === "partial" ? (
        <StatusBadge
          tone="warning"
          icon={<CircleSlash />}
          label={t("localSkills.partlyDisabled")}
        />
      ) : null}
      {badges}
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
        <Files className="size-3" />
        {t("localSkills.fileCount", { count: item.fileCount })}
      </span>
    </div>
  );
}
