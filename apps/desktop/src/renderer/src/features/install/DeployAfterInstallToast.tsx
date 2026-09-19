import type { Skill } from "@skillboard/shared";
import { X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { IconButton } from "@/components/IconButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useApplySkills } from "@/hooks/mutations/deploy";
import { useAvailableAgents } from "@/hooks/queries/agents";

export interface DeployAfterInstallToastProps {
  /** The skills that were just installed. */
  skills: readonly Skill[];
  onClose: () => void;
}

/**
 * Follow-up to a finished install, shown as a toast so it works from any page: tick the agents
 * that should get the new skills and deploy in one go.
 */
export function DeployAfterInstallToast({
  skills,
  onClose,
}: DeployAfterInstallToastProps): ReactNode {
  const { t } = useTranslation();
  const agents = useAvailableAgents();
  const apply = useApplySkills();
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());

  const all = agents.data ?? [];
  const allChosen = all.length > 0 && chosen.size === all.length;

  const toggle = (agentKey: string): void => {
    setChosen((previous) => {
      const next = new Set(previous);
      if (!next.delete(agentKey)) next.add(agentKey);
      return next;
    });
  };

  const deploy = (): void => {
    apply.mutate(
      { skillIds: skills.map((skill) => skill.id), agentKeys: [...chosen], action: "add" },
      { onSuccess: onClose },
    );
  };

  return (
    <div className="flex w-(--width) flex-col gap-3 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t("install.deploy.title")}</p>
          <p className="truncate text-xs text-muted-foreground">
            {skills.length === 1
              ? skills[0]?.name
              : t("install.deploy.skillCount", { count: skills.length })}
          </p>
        </div>
        <IconButton size="icon-xs" label={t("common.dismiss")} icon={<X />} onClick={onClose} />
      </div>

      {agents.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : all.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("install.deploy.noAgents")}</p>
      ) : (
        <ul className="-mx-1 flex max-h-48 flex-col overflow-y-auto">
          {all.map((agent) => (
            <li key={agent.key}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-accent/60">
                <Checkbox
                  checked={chosen.has(agent.key)}
                  onCheckedChange={() => toggle(agent.key)}
                />
                <AgentAvatar agentKey={agent.key} name={agent.displayName} size="sm" />
                <span className="truncate">{agent.displayName}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={all.length === 0}
          onClick={() => setChosen(allChosen ? new Set() : new Set(all.map((agent) => agent.key)))}
        >
          {t(allChosen ? "selection.selectNone" : "selection.selectAll")}
        </Button>
        <Button size="sm" disabled={chosen.size === 0 || apply.isPending} onClick={deploy}>
          {apply.isPending ? <Spinner /> : null}
          {chosen.size === 0
            ? t("install.deploy.confirmNone")
            : t("install.deploy.confirm", { count: chosen.size })}
        </Button>
      </div>
    </div>
  );
}
