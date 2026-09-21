import { formatBytes } from "@loadout/shared";
import { Check, HardDrive, Minus, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { InlineNotice } from "@/components/InlineNotice";
import { Panel } from "@/components/Panel";
import { useBackupSizeReport } from "@/hooks/queries/backup-page";
import { MAX_LISTED_OVERSIZED } from "./constants";

const INCLUDED = ["skills", "metadata", "presets"] as const;
const EXCLUDED = ["credentials", "settings", "deployments", "paths", "junk"] as const;

/** What a backup holds, what it never holds, and warnings about size. */
export function BackupContents(): ReactNode {
  const { t } = useTranslation();
  const { data: report } = useBackupSizeReport();
  const excluded = report?.oversized.filter((skill) => skill.excluded) ?? [];
  const tracked = report?.oversized.filter((skill) => !skill.excluded) ?? [];
  const limit = report ? formatBytes(report.skillLimitBytes) : "";
  const names = (skills: typeof excluded): string => {
    const shown = skills
      .slice(0, MAX_LISTED_OVERSIZED)
      .map((skill) => `${skill.name} (${formatBytes(skill.bytes)})`);
    const rest = skills.length - shown.length;
    if (rest > 0) shown.push(t("common.andMore", { count: rest }));
    return shown.join(", ");
  };

  return (
    <Panel title={t("backupPage.contents.title")}>
      <ul className="flex flex-col gap-1.5 text-sm">
        {INCLUDED.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
            {t(`backupPage.contents.included.${item}`)}
          </li>
        ))}
      </ul>
      <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {t("backupPage.contents.neverTitle")}
      </p>
      <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
        {EXCLUDED.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <Minus className="mt-0.5 size-3.5 shrink-0" />
            {t(`backupPage.contents.excluded.${item}`)}
          </li>
        ))}
      </ul>

      {report ? (
        <p className="flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
          <HardDrive className="size-3.5" />
          {t("backupPage.contents.size", { size: formatBytes(report.totalBytes) })}
        </p>
      ) : null}
      {excluded.length > 0 ? (
        <InlineNotice tone="warning" icon={TriangleAlert}>
          {t("backupPage.contents.oversizedExcluded", { count: excluded.length, limit })}{" "}
          <span data-selectable>{names(excluded)}</span>
        </InlineNotice>
      ) : null}
      {tracked.length > 0 ? (
        <InlineNotice tone="info" icon={TriangleAlert}>
          {t("backupPage.contents.oversizedTracked", { count: tracked.length, limit })}{" "}
          <span data-selectable>{names(tracked)}</span>
        </InlineNotice>
      ) : null}
      {report && report.totalBytes > report.repoWarnBytes ? (
        <InlineNotice tone="warning" icon={TriangleAlert}>
          {t("backupPage.contents.totalLarge", { limit: formatBytes(report.repoWarnBytes) })}
        </InlineNotice>
      ) : null}
    </Panel>
  );
}
