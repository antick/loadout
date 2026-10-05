import type { ErrorComponentProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CloseDialog } from "@/components/CloseDialog";
import { ErrorState } from "@/components/ErrorState";
import { WindowDragRegion } from "@/components/layout/WindowDragRegion";
import { TOP_BAR_HEIGHT_CLASS } from "@/lib/constants";

/**
 * The app shell itself failed to render. The window stays usable: it can be moved, reloaded, and
 * its close button still gets the "quit or keep in tray?" question.
 */
export function RootError({ error }: ErrorComponentProps): ReactNode {
  const { t } = useTranslation();
  return (
    <div className="flex h-screen flex-col bg-background">
      <WindowDragRegion className={TOP_BAR_HEIGHT_CLASS} />
      <ErrorState
        className="flex-1"
        error={error}
        title={t("errors.appFailed")}
        retryLabel={t("common.reload")}
        onRetry={() => window.location.reload()}
      />
      <CloseDialog />
    </div>
  );
}
