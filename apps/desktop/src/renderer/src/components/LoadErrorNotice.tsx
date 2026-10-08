import { CircleAlert, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { InlineNotice } from "@/components/InlineNotice";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/toast";

export interface LoadErrorNoticeProps {
  error: unknown;
  /** Usually `query.refetch`. */
  onRetry: () => void;
  className?: string;
}

/**
 * A part of a page that could not load, in its place: why, and Retry. Never an empty space or a
 * skeleton that waits forever. A whole page that failed uses `ErrorState`.
 */
export function LoadErrorNotice({ error, onRetry, className }: LoadErrorNoticeProps): ReactNode {
  const { t } = useTranslation();
  return (
    <InlineNotice
      tone="danger"
      icon={CircleAlert}
      className={className}
      actions={
        <Button variant="ghost" size="sm" onClick={onRetry}>
          <RotateCw />
          {t("common.retry")}
        </Button>
      }
    >
      <p className="font-medium">{t("errors.loadFailed")}</p>
      <p data-selectable className="text-muted-foreground">
        {errorMessage(error)}
      </p>
    </InlineNotice>
  );
}
