import type { BatchImportResult } from "@skillboard/shared";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "@/components/IconButton";
import { TONE_CLASSES, type StatusTone } from "@/components/StatusBadge";
import { BATCH_ERRORS_MAX_VISIBLE } from "@/features/install/constants";
import { cn } from "@/lib/utils";

export interface BatchResultSummaryProps {
  result: BatchImportResult;
  /** What was imported, e.g. the folder path. */
  subject?: ReactNode;
  onDismiss: () => void;
}

function Count({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: StatusTone;
}): ReactNode {
  return (
    <div className={cn("flex items-baseline gap-1.5 rounded-md px-2.5 py-1.5", TONE_CLASSES[tone])}>
      <span className="text-base font-semibold tabular-nums">{value}</span>
      <span className="text-xs">{label}</span>
    </div>
  );
}

/** Outcome of a bulk import: imported / skipped / failed, then the reason for each failure. */
export function BatchResultSummary({
  result,
  subject,
  onDismiss,
}: BatchResultSummaryProps): ReactNode {
  const { t } = useTranslation();
  const shown = result.errors.slice(0, BATCH_ERRORS_MAX_VISIBLE);
  const hidden = result.errors.length - shown.length;

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t("install.batch.title")}</p>
          {subject ? <div className="mt-0.5 min-w-0">{subject}</div> : null}
        </div>
        <IconButton size="icon-xs" label={t("common.dismiss")} icon={<X />} onClick={onDismiss} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Count value={result.imported} label={t("install.batch.importedLabel")} tone="success" />
        <Count value={result.skipped} label={t("install.batch.skippedLabel")} tone="neutral" />
        <Count
          value={result.errors.length}
          label={t("install.batch.failedLabel")}
          tone={result.errors.length > 0 ? "danger" : "neutral"}
        />
      </div>
      {result.skipped > 0 ? (
        <p className="text-xs text-muted-foreground">{t("install.batch.skippedHint")}</p>
      ) : null}
      {shown.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs" data-selectable>
          {shown.map((failure) => (
            <li key={`${failure.name}:${failure.message}`} className="flex gap-2">
              <span className="shrink-0 font-mono font-medium text-danger">{failure.name}</span>
              <span className="min-w-0 text-muted-foreground">{failure.message}</span>
            </li>
          ))}
          {hidden > 0 ? (
            <li className="text-muted-foreground">{t("common.andMore", { count: hidden })}</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
