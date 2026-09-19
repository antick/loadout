import type { PresetAgentToggle } from "@skillboard/shared";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useSetPresetToggle } from "@/hooks/mutations/preset-detail";
import { usePresetToggles } from "@/hooks/queries/preset-detail";
import { errorMessage } from "@/lib/toast";

export interface PresetSkillTogglesProps {
  presetId: string;
  skillId: string;
}

function isUsable(toggle: PresetAgentToggle): boolean {
  return toggle.installed && toggle.globallyEnabled;
}

/** Per-agent switches for one skill inside one preset. Loaded when the row is expanded. */
export function PresetSkillToggles({ presetId, skillId }: PresetSkillTogglesProps): ReactNode {
  const { t } = useTranslation();
  const toggles = usePresetToggles(presetId, skillId, true);
  const setToggle = useSetPresetToggle();

  if (toggles.isPending) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
      </div>
    );
  }
  if (toggles.isError) {
    return <p className="text-sm text-danger">{errorMessage(toggles.error)}</p>;
  }

  // Agents that can take the skill first; the rest stay visible with the reason.
  const ordered = [...toggles.data].sort((a, b) => Number(isUsable(b)) - Number(isUsable(a)));

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">{t("presetPage.toggles.hint")}</p>
      <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {ordered.map((toggle) => {
          const usable = isUsable(toggle);
          const reason = toggle.installed
            ? t("presetPage.toggles.disabled")
            : t("presetPage.toggles.notInstalled");
          return (
            <li key={toggle.agentKey} className="flex items-center gap-2.5 py-1">
              <AgentAvatar
                agentKey={toggle.agentKey}
                name={toggle.displayName}
                size="sm"
                status={usable && toggle.enabled ? undefined : "off"}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{toggle.displayName}</span>
                {usable ? null : (
                  <span className="block truncate text-xs text-muted-foreground">{reason}</span>
                )}
              </span>
              <Switch
                checked={usable && toggle.enabled}
                disabled={!usable}
                aria-label={t("presetPage.toggles.switchLabel", { agent: toggle.displayName })}
                onCheckedChange={(enabled) =>
                  setToggle.mutate({ presetId, skillId, agentKey: toggle.agentKey, enabled })
                }
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
