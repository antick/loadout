import { CircleAlert, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { errorMessage } from "@/lib/toast";

export interface ErrorStateProps {
  error: unknown;
  /** Usually `query.refetch`. */
  onRetry?: () => void;
  title?: string;
  className?: string;
}

/** A failed load: the message and a Retry button. */
export function ErrorState({ error, onRetry, title, className }: ErrorStateProps): ReactNode {
  const { t } = useTranslation();
  return (
    <Empty className={className} role="alert">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-danger/15 text-danger">
          <CircleAlert />
        </EmptyMedia>
        <EmptyTitle>{title ?? t("errors.loadFailed")}</EmptyTitle>
        <EmptyDescription data-selectable>{errorMessage(error)}</EmptyDescription>
      </EmptyHeader>
      {onRetry ? (
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCw />
            {t("common.retry")}
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
