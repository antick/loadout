import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Panel } from "@/components/Panel";

export interface BackupSummaryProps {
  skillCount: number | undefined;
  snapshotCount: number | undefined;
  conflictCount: number;
}

function Row({ label, value }: { label: string; value: ReactNode }): ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

/** A few numbers about the backup. */
export function BackupSummary({
  skillCount,
  snapshotCount,
  conflictCount,
}: BackupSummaryProps): ReactNode {
  const { t } = useTranslation();
  const dash = t("backupPage.summary.unknown");
  return (
    <Panel title={t("backupPage.summary.title")}>
      <dl className="flex flex-col gap-1.5">
        <Row label={t("backupPage.summary.skills")} value={skillCount ?? dash} />
        <Row label={t("backupPage.summary.snapshots")} value={snapshotCount ?? dash} />
        <Row label={t("backupPage.summary.conflicts")} value={conflictCount} />
      </dl>
    </Panel>
  );
}
