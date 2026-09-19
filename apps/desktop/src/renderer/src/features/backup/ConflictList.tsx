import { type BackupConflict, type ConflictResolution, formatRelative } from "@skillboard/shared";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { PageSection } from "@/components/PageSection";
import { Button } from "@/components/ui/button";
import { useResolveBackupConflict } from "@/hooks/mutations/backup-page";
import { SHORT_COMMIT_LENGTH } from "./constants";

const ACTIONS: readonly ConflictResolution[] = ["keep_local", "use_remote", "keep_both"];

/** Skills that changed on two devices. Each one waits here until the user picks a version. */
export function ConflictList({ conflicts }: { conflicts: readonly BackupConflict[] }): ReactNode {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const resolve = useResolveBackupConflict();
  if (conflicts.length === 0) return null;

  const choose = async (conflict: BackupConflict, action: ConflictResolution): Promise<void> => {
    // Only "use remote" replaces what is on this machine, so only it asks first.
    if (action === "use_remote") {
      const confirmed = await confirm({
        title: t("backupPage.conflicts.useRemoteTitle", { name: conflict.skillName }),
        description: t("backupPage.conflicts.useRemoteBody"),
        confirmLabel: t("backupPage.conflicts.action.use_remote"),
        destructive: true,
      });
      if (!confirmed) return;
    }
    resolve.mutate({ conflict, action });
  };

  return (
    <PageSection
      title={t("backupPage.conflicts.title")}
      description={t("backupPage.conflicts.description", { count: conflicts.length })}
    >
      <ul className="flex flex-col divide-y rounded-lg border border-warning/40 bg-card">
        {conflicts.map((conflict) => {
          const pending =
            resolve.isPending && resolve.variables?.conflict.skillKey === conflict.skillKey;
          return (
            <li key={conflict.skillKey} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <TriangleAlert className="size-4 shrink-0 text-warning" />
              <div className="min-w-40 flex-1">
                <p className="truncate text-sm font-medium">{conflict.skillName}</p>
                <p className="text-xs text-muted-foreground">
                  {t("backupPage.conflicts.detected", {
                    when: formatRelative(conflict.detectedAt),
                  })}
                  {" · "}
                  <span className="font-mono">
                    {conflict.theirsCommit.slice(0, SHORT_COMMIT_LENGTH)}
                  </span>
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {ACTIONS.map((action) => (
                  <Button
                    key={action}
                    size="sm"
                    variant={action === "keep_local" ? "secondary" : "outline"}
                    disabled={pending}
                    title={t(`backupPage.conflicts.hint.${action}`)}
                    onClick={() => void choose(conflict, action)}
                  >
                    {t(`backupPage.conflicts.action.${action}`)}
                  </Button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </PageSection>
  );
}
