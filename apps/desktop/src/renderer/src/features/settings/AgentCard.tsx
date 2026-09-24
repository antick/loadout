import type { AgentInfo } from "@loadout/shared";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { useConfirm } from "@/components/ConfirmDialog";
import { IconButton } from "@/components/IconButton";
import { StatusBadge } from "@/components/StatusBadge";
import { Switch } from "@/components/ui/switch";
import { useRemoveCustomAgent, useSetAgentEnabled } from "@/hooks/mutations/settings-page";
import { cn } from "@/lib/utils";
import { AgentPathField } from "./AgentPathField";

export interface AgentCardProps {
  agent: AgentInfo;
  /** Library skills currently installed for this agent; switching it off removes them. */
  deployedCount: number;
  /** Display names by key, to say who shares a folder. */
  namesByKey: ReadonlyMap<string, string>;
  /** Keyboard alternative to dragging; undefined at the ends of the list or while filtering. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

/** One agent in Settings: switch, badges and its two skill folders. */
export function AgentCard({
  agent,
  deployedCount,
  namesByKey,
  onMoveUp,
  onMoveDown,
}: AgentCardProps): ReactNode {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const setEnabled = useSetAgentEnabled();
  const remove = useRemoveCustomAgent();
  const sharedWith = agent.sharesDirWith.map((key) => namesByKey.get(key) ?? key);

  const toggle = async (enabled: boolean): Promise<void> => {
    // Switching an agent off takes the library's skills out of its folder.
    if (!enabled && deployedCount > 0) {
      const confirmed = await confirm({
        title: t("settings.agents.disableTitle", { name: agent.displayName }),
        description: t("settings.agents.disableBody", { count: deployedCount }),
        confirmLabel: t("settings.agents.disable"),
        destructive: true,
      });
      if (!confirmed) return;
    }
    setEnabled.mutate({ key: agent.key, enabled });
  };

  const askRemove = async (): Promise<void> => {
    const confirmed = await confirm({
      title: t("settings.agents.removeTitle", { name: agent.displayName }),
      description: t("settings.agents.removeBody"),
      items: [agent.skillsDir],
      confirmLabel: t("settings.agents.remove"),
      destructive: true,
    });
    if (confirmed) remove.mutate(agent);
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-lg border bg-card px-4 py-3 transition-colors duration-150 hover:border-primary/40",
        !agent.installed && "bg-card/60",
      )}
    >
      <div className="flex items-center gap-3">
        <AgentAvatar
          agentKey={agent.key}
          name={agent.displayName}
          status={agent.installed ? undefined : "off"}
        />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium">{agent.displayName}</span>
          {agent.installed ? null : (
            <StatusBadge tone="neutral" label={t("settings.agents.badge.notInstalled")} />
          )}
          {agent.isCustom ? (
            <StatusBadge tone="kit" label={t("settings.agents.badge.custom")} />
          ) : null}
          {agent.hasPathOverride || agent.hasProjectPathOverride ? (
            <StatusBadge tone="info" label={t("settings.agents.badge.customPath")} />
          ) : null}
          {sharedWith.length > 0 ? (
            <StatusBadge
              tone="warning"
              label={t("settings.agents.badge.shares", { names: sharedWith.join(", ") })}
            />
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {onMoveUp || onMoveDown ? (
            <>
              <IconButton
                size="icon-xs"
                label={t("common.moveUp")}
                icon={<ChevronUp />}
                disabled={!onMoveUp}
                onClick={onMoveUp}
              />
              <IconButton
                size="icon-xs"
                label={t("common.moveDown")}
                icon={<ChevronDown />}
                disabled={!onMoveDown}
                onClick={onMoveDown}
              />
            </>
          ) : null}
          {agent.isCustom ? (
            <IconButton
              size="icon-xs"
              label={t("settings.agents.remove")}
              icon={<Trash2 />}
              disabled={remove.isPending}
              onClick={() => void askRemove()}
            />
          ) : null}
          <Switch
            className="ml-2"
            checked={agent.enabled && agent.installed}
            disabled={!agent.installed}
            aria-label={t("settings.agents.enable", { name: agent.displayName })}
            onCheckedChange={(enabled) => void toggle(enabled)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1 pl-10">
        <AgentPathField
          agentKey={agent.key}
          kind="global"
          label={t("settings.agents.globalPath")}
          value={agent.skillsDir}
          overridden={agent.hasPathOverride && !agent.isCustom}
          clearable={false}
        />
        <AgentPathField
          agentKey={agent.key}
          kind="project"
          label={t("settings.agents.projectPath")}
          value={agent.projectSkillsDir}
          overridden={agent.hasProjectPathOverride && !agent.isCustom}
          clearable={agent.isCustom}
        />
      </div>
    </div>
  );
}
