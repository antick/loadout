import { Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ShellBanner } from "@/components/ShellBanner";
import { Button } from "@/components/ui/button";
import { useDismissRepair, useRepairDeployments } from "@/hooks/mutations/app";
import { useRepairReport } from "@/hooks/queries/app";

/**
 * What the start-up repair could not put back: a deployment whose place is taken by a folder
 * Loadout did not create, or whose skill folder is gone. Retry runs the repair again.
 */
export function RepairBanner(): ReactNode {
  const { t } = useTranslation();
  const report = useRepairReport();
  const retry = useRepairDeployments();
  const dismiss = useDismissRepair();
  const failed = report.data?.failed ?? [];
  if (failed.length === 0) return null;
  const [first] = failed;
  const rest = failed.length - 1;

  return (
    <ShellBanner
      tone="warning"
      icon={Wrench}
      title={t("banners.repairTitle", { count: failed.length })}
      description={
        first
          ? `${first.skill} (${first.agent}): ${first.message}${
              rest > 0 ? ` ${t("common.andMore", { count: rest })}` : ""
            }`
          : undefined
      }
      actions={
        <>
          <Button
            variant="ghost"
            size="xs"
            disabled={retry.isPending}
            onClick={() => retry.mutate()}
          >
            {t("common.retry")}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            disabled={dismiss.isPending}
            onClick={() => dismiss.mutate()}
          >
            {t("common.dismiss")}
          </Button>
        </>
      }
    />
  );
}
