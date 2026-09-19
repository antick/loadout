import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export interface ProgressPanelProps {
  title: string;
  /** Live line under the title, e.g. "Importing 3/12: name". */
  detail?: string;
  /** 0–100, or null while the amount of work is unknown (shows a moving bar instead). */
  percent: number | null;
  /** Shows a Cancel button. */
  onCancel?: () => void;
  /** Cancel was pressed and the work is winding down. */
  cancelling?: boolean;
  className?: string;
}

/** A running job shown in the page: what it is, where it is, how far along, and a way to stop it. */
export function ProgressPanel({
  title,
  detail,
  percent,
  onCancel,
  cancelling,
  className,
}: ProgressPanelProps): ReactNode {
  const { t } = useTranslation();
  return (
    <div
      aria-live="polite"
      className={cn("flex flex-col gap-3 rounded-lg border bg-card p-4", className)}
    >
      <div className="flex items-center gap-3">
        <Spinner className="size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
          {detail ? (
            <p className="truncate text-xs text-muted-foreground tabular-nums">{detail}</p>
          ) : null}
        </div>
        {onCancel ? (
          <Button variant="outline" size="sm" disabled={cancelling} onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        ) : null}
      </div>
      {percent === null ? (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/20">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
        </div>
      ) : (
        <Progress value={percent} className="h-1.5" />
      )}
    </div>
  );
}
