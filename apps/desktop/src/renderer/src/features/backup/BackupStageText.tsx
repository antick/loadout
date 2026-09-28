import type { BackupStage } from "@loadout/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** One quiet line saying what the sync is doing right now. Nothing when it is not running. */
export function BackupStageText({
  stage,
  className,
}: {
  stage: BackupStage | null;
  className?: string;
}): ReactNode {
  const { t } = useTranslation();
  if (!stage) return null;
  return (
    <output className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
      <Spinner className="size-3" />
      {t(`backupSync.stage.${stage}`)}
    </output>
  );
}
