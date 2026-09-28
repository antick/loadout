import { formatRelative } from "@loadout/shared";
import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { SkillUsageView } from "@/hooks/queries/usage";
import { cn } from "@/lib/utils";

/** When the agents' logs were last read, with a button to read them again. */
export function UsageReadStatus({
  usage,
  className,
}: {
  usage: SkillUsageView;
  className?: string;
}): ReactNode {
  const { t } = useTranslation();
  const scannedAt = usage.report?.scannedAt ?? null;
  return (
    <div
      className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}
      aria-live="polite"
    >
      {usage.scanning ? (
        <>
          <Spinner className="size-3" />
          <span>{t("usage.reading")}</span>
        </>
      ) : (
        <>
          {scannedAt ? (
            <span>{t("usage.lastRead", { when: formatRelative(scannedAt) })}</span>
          ) : null}
          <Button variant="ghost" size="xs" onClick={usage.refresh}>
            <RefreshCw />
            {t("usage.refresh")}
          </Button>
        </>
      )}
    </div>
  );
}
