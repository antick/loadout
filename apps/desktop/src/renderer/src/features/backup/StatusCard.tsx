import { type BackupStatus, formatRelative } from "@skillboard/shared";
import {
  CircleAlert,
  CircleCheck,
  CloudOff,
  CloudUpload,
  LogIn,
  type LucideIcon,
  RefreshCw,
  TerminalSquare,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { InlineEdit } from "@/components/InlineEdit";
import type { StatusTone } from "@/components/StatusBadge";
import { TONE_CLASSES } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { BackupMode, BackupModeKind } from "@/lib/backup-mode";
import { DEVICE_NAME_MAX_LENGTH } from "./constants";

export interface StatusCardProps {
  mode: BackupMode;
  status: BackupStatus | undefined;
  deviceName: string | undefined;
  /** Friendly text of the last failure, shown in `failed` mode. */
  errorText: string | null;
  busy: boolean;
  onPrimary: () => void;
  /** Offered when a GitHub remote refused the stored credentials. */
  onReconnect?: () => void;
  onRenameDevice: (name: string) => void;
}

const MODE_LOOK: Record<BackupModeKind, { tone: StatusTone; icon: LucideIcon }> = {
  loading: { tone: "neutral", icon: RefreshCw },
  git_missing: { tone: "danger", icon: TerminalSquare },
  not_set_up: { tone: "neutral", icon: CloudOff },
  needs_remote: { tone: "neutral", icon: CloudOff },
  needs_fix: { tone: "danger", icon: Wrench },
  failed: { tone: "danger", icon: CircleAlert },
  pending: { tone: "warning", icon: CloudUpload },
  up_to_date: { tone: "success", icon: CircleCheck },
};

/** i18n key suffix for the mode: pending and needs-fix have one wording per variant. */
function copyKey(mode: BackupMode): string {
  if (mode.kind === "pending") return `pending_${mode.side}`;
  if (mode.kind === "needs_fix") return `needs_fix_${mode.reason}`;
  return mode.kind;
}

function Fact({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 min-w-0 truncate text-sm">{children}</dd>
    </div>
  );
}

/** The headline of the Backup page: where things stand and the one thing to do next. */
export function StatusCard({
  mode,
  status,
  deviceName,
  errorText,
  busy,
  onPrimary,
  onReconnect,
  onRenameDevice,
}: StatusCardProps): ReactNode {
  const { t } = useTranslation();

  if (mode.kind === "loading") {
    return (
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-5">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-80 max-w-full" />
          </div>
        </div>
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  const { tone, icon: Icon } = MODE_LOOK[mode.kind];
  const key = copyKey(mode);
  // Local wording counts changed skills; remote wording counts the backups to bring in.
  const count =
    mode.kind === "pending" && mode.side !== "local"
      ? (status?.behind ?? 0)
      : (status?.changedSkillCount ?? 0);
  const snapshot = status?.restoredFrom ?? status?.currentSnapshot ?? null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={cn(
            "inline-flex size-10 shrink-0 items-center justify-center rounded-lg",
            TONE_CLASSES[tone],
          )}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-48 flex-1">
          <h2 className="text-base font-semibold tracking-tight">
            {t(`backupPage.status.title.${key}`)}
          </h2>
          <p data-selectable className="mt-0.5 text-sm text-muted-foreground">
            {mode.kind === "failed" && errorText
              ? errorText
              : t(`backupPage.status.body.${key}`, { count })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onReconnect ? (
            <Button variant="outline" size="sm" onClick={onReconnect}>
              <LogIn />
              {t("backupPage.status.reconnect")}
            </Button>
          ) : null}
          <Button size="sm" disabled={busy} onClick={onPrimary}>
            {busy ? <Spinner /> : null}
            {t(`backupPage.status.action.${key}`)}
          </Button>
        </div>
      </div>

      {status?.isRepo || status?.remoteUrl ? (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t pt-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)]">
          <Fact label={t("backupPage.status.repository")}>
            <span data-selectable className="font-mono text-xs" title={status.remoteUrl ?? ""}>
              {status.remoteUrl ?? t("backupPage.status.noRemote")}
            </span>
          </Fact>
          <Fact label={t("backupPage.status.branch")}>
            <span className="font-mono text-xs">
              {status.branch ?? t("backupPage.status.noBranch")}
            </span>
          </Fact>
          <Fact label={t("backupPage.status.device")}>
            <InlineEdit
              key={deviceName}
              value={deviceName ?? ""}
              label={t("backupPage.status.deviceEdit")}
              onSubmit={(name) => onRenameDevice(name.slice(0, DEVICE_NAME_MAX_LENGTH))}
            />
          </Fact>
          <Fact
            label={t(
              status.restoredFrom ? "backupPage.status.restoredFrom" : "backupPage.status.snapshot",
            )}
          >
            {snapshot ? (
              <span data-selectable className="font-mono text-xs" title={snapshot}>
                {snapshot}
              </span>
            ) : (
              <span className="text-muted-foreground">{t("backupPage.status.noSnapshot")}</span>
            )}
          </Fact>
          {status.lastCommitAt ? (
            <p className="col-span-full text-xs text-muted-foreground">
              {t("backupPage.status.lastBackup", { when: formatRelative(status.lastCommitAt) })}
            </p>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}
