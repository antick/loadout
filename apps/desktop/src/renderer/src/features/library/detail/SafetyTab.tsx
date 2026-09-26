import type { Skill } from "@loadout/shared";
import { Link } from "@tanstack/react-router";
import { ScanSearch, ShieldOff } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { SafetyReportView } from "@/features/safety/SafetyReportView";
import { useScanSkill } from "@/hooks/mutations/safety";
import { useSafetyReports, useSafetyStatus } from "@/hooks/queries/safety";

/** The skill's last safety report, and a button to check it (again). */
export function SafetyTab({ skill }: { skill: Skill }): ReactNode {
  const { t } = useTranslation();
  const status = useSafetyStatus();
  const record = useSafetyReports().get(skill.id);
  const scan = useScanSkill();

  if (status.isPending) return <Skeleton className="h-24 w-full" />;
  if (!status.data?.available && !record) {
    return (
      <EmptyState
        icon={ShieldOff}
        title={t("safety.detail.title")}
        description={t("safety.detail.needsScanner")}
      >
        <Button variant="outline" size="sm" asChild>
          <Link to="/settings" search={{ section: "safety" }}>
            {t("safety.detail.openSettings")}
          </Link>
        </Button>
      </EmptyState>
    );
  }

  const checkButton = (
    <Button
      variant="outline"
      size="sm"
      disabled={!status.data?.available || scan.isPending}
      onClick={() => scan.mutate(skill.id)}
    >
      {scan.isPending ? <Spinner /> : <ScanSearch />}
      {t(record ? "safety.detail.checkAgain" : "safety.detail.check")}
    </Button>
  );

  if (!record) {
    return (
      <EmptyState
        icon={ScanSearch}
        title={t("safety.detail.title")}
        description={t("safety.detail.none")}
      >
        {checkButton}
      </EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <SafetyReportView report={record} stale={record.stale} />
      <div>{checkButton}</div>
    </div>
  );
}
