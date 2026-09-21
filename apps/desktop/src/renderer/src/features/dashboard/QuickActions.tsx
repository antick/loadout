import type { BackupStatus } from "@loadout/shared";
import { useNavigate } from "@tanstack/react-router";
import { CloudUpload, FolderPlus, PackagePlus, ScanSearch } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useShell } from "@/components/layout/shell-context";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useSyncBackup } from "@/hooks/mutations/backup-page";

/** The four things people come to the dashboard to start. */
export function QuickActions({ backup }: { backup: BackupStatus | undefined }): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const shell = useShell();
  const sync = useSyncBackup();
  const backupReady = Boolean(backup?.isRepo && backup.remoteUrl && backup.gitAvailable);

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => void navigate({ to: "/install" })}>
        <PackagePlus />
        {t("dashboard.actions.install")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void navigate({ to: "/install", search: { tab: "scan" } })}
      >
        <ScanSearch />
        {t("dashboard.actions.scan")}
      </Button>
      <Button variant="outline" size="sm" onClick={shell.openAddProject}>
        <FolderPlus />
        {t("dashboard.actions.linkProject")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={sync.isPending}
        // Without a remote there is nothing to sync to yet: the Backup page walks through setup.
        onClick={() => (backupReady ? sync.mutate() : void navigate({ to: "/backup" }))}
      >
        {sync.isPending ? <Spinner /> : <CloudUpload />}
        {t("dashboard.actions.backup")}
      </Button>
    </div>
  );
}
