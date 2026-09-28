import type { ReactNode } from "react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Panel } from "@/components/Panel";
import { PathText } from "@/components/PathText";
import { SettingRow } from "@/components/SettingRow";
import { Switch } from "@/components/ui/switch";
import { UsageReadStatus } from "@/components/UsageReadStatus";
import { useSetUsageTracking } from "@/hooks/mutations/usage";
import { useAgents } from "@/hooks/queries/agents";
import { useSkillUsage } from "@/hooks/queries/usage";

/** The switch for counting skill use, and which agents' logs it reads. */
export function UsagePanel(): ReactNode {
  const { t } = useTranslation();
  const usage = useSkillUsage();
  const agents = useAgents();
  const setTracking = useSetUsageTracking();
  const switchId = useId();
  if (!usage.report) return null;

  const nameOf = (key: string): string =>
    agents.data?.find((agent) => agent.key === key)?.displayName ?? key;

  return (
    <Panel title={t("usage.card.title")}>
      <div className="flex flex-col divide-y">
        <SettingRow
          label={t("usage.settings.label")}
          description={t("usage.settings.description")}
          htmlFor={switchId}
        >
          <Switch
            id={switchId}
            checked={usage.enabled}
            disabled={setTracking.isPending}
            onCheckedChange={(on) => setTracking.mutate(on)}
          />
        </SettingRow>
        {usage.enabled ? (
          <div className="flex flex-col gap-1.5 py-3 last:pb-0">
            {usage.report.logs.map((log) => (
              <div key={log.agentKey} className="flex items-center gap-2 text-sm">
                <span className="w-28 shrink-0 font-medium">{nameOf(log.agentKey)}</span>
                <PathText
                  path={log.path}
                  reveal={log.found}
                  className="min-w-0 flex-1 text-xs text-muted-foreground"
                />
                <span className="shrink-0 text-xs text-muted-foreground">
                  {log.found ? t("usage.settings.found") : t("usage.settings.missing")}
                </span>
              </div>
            ))}
            <UsageReadStatus usage={usage} className="self-end" />
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
