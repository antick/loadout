import { USAGE_RECENT_DAYS, formatRelative } from "@loadout/shared";
import { Activity } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAgents } from "@/hooks/queries/agents";
import { useAppInfo } from "@/hooks/queries/app";
import { useSkillUsage } from "@/hooks/queries/usage";
import { compactHome } from "@/lib/paths";

/**
 * How often agents ran this skill, which agents and in which projects. Shown only while usage
 * tracking is on.
 */
export function SkillUsageSummary({ skillId }: { skillId: string }): ReactNode {
  const { t } = useTranslation();
  const usage = useSkillUsage();
  const agents = useAgents();
  const { data: info } = useAppInfo();
  if (!usage.enabled || !usage.report?.scannedAt) return null;

  const used = usage.byId.get(skillId);
  const nameOf = (key: string): string =>
    agents.data?.find((agent) => agent.key === key)?.displayName ?? key;

  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground">
      <Activity className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {used ? (
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="tabular-nums">
            <span className="font-medium text-foreground">
              {t("usage.detail.runs", { count: used.uses })}
            </span>
            {" · "}
            {t("usage.detail.recent", { count: used.recentUses, days: USAGE_RECENT_DAYS })}
            {" · "}
            {t("usage.detail.last", { when: formatRelative(used.lastUsedAt) })}
            {" · "}
            {Object.entries(used.byAgent)
              .map(([key, count]) => `${nameOf(key)} ${count}`)
              .join(", ")}
          </p>
          {used.projects.length > 0 ? (
            <p className="truncate" title={used.projects.join("\n")}>
              {t("usage.detail.projects")}{" "}
              {used.projects.map((path) => compactHome(path, info?.homeDir)).join(", ")}
            </p>
          ) : null}
        </div>
      ) : (
        <p>{t("usage.detail.never")}</p>
      )}
    </div>
  );
}
