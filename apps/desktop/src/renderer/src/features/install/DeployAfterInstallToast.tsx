import type { Skill } from "@loadout/shared";
import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { deployPlan } from "@/components/agent-checklist";
import { AgentChecklist } from "@/components/AgentChecklist";
import { IconButton } from "@/components/IconButton";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useApplySkills } from "@/hooks/mutations/deploy";
import { useAvailableAgents } from "@/hooks/queries/agents";
import { soleItem } from "@/lib/batch";

/** Agents to tick when the panel opens: some keys, or every agent. */
export type DeployPreselection = readonly string[] | "all";

export interface DeployAfterInstallToastProps {
  /** The skills that were just installed. */
  skills: readonly Skill[];
  /** Ticked when the agents have loaded; keys of agents that are not available are ignored. */
  preselect?: DeployPreselection;
  onClose: () => void;
}

/**
 * Follow-up to a finished install, shown as a toast so it works from any page: tick the agents
 * that should get the new skills and deploy in one go.
 */
export function DeployAfterInstallToast({
  skills,
  preselect,
  onClose,
}: DeployAfterInstallToastProps): ReactNode {
  const { t } = useTranslation();
  const agents = useAvailableAgents();
  const apply = useApplySkills();
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const seeded = useRef(false);

  // Tick what the source asked for once the agent list is known, and only once.
  useEffect(() => {
    if (seeded.current || !preselect || !agents.data) return;
    seeded.current = true;
    const keys = agents.data.map((agent) => agent.key);
    setChosen(new Set(preselect === "all" ? keys : keys.filter((key) => preselect.includes(key))));
  }, [agents.data, preselect]);

  // Agents the skills are blocked for, or that already have them, get nothing.
  const plan = deployPlan(skills, chosen);

  const deploy = (): void => {
    apply.mutate(
      { skillIds: plan.skillIds, agentKeys: plan.agentKeys, action: "add" },
      { onSuccess: onClose },
    );
  };

  return (
    <div className="flex w-(--width) flex-col gap-3 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t("install.deploy.title")}</p>
          <p className="truncate text-xs text-muted-foreground">
            {soleItem(skills)?.name ?? t("install.deploy.skillCount", { count: skills.length })}
          </p>
        </div>
        <IconButton size="icon-xs" label={t("common.dismiss")} icon={<X />} onClick={onClose} />
      </div>

      <AgentChecklist
        skills={skills}
        chosen={chosen}
        onChange={setChosen}
        listClassName="max-h-48"
      />

      <Button
        size="sm"
        className="self-end"
        disabled={plan.pairs === 0 || apply.isPending}
        onClick={deploy}
      >
        {apply.isPending ? <Spinner /> : null}
        {plan.agentKeys.length === 0
          ? t("install.deploy.confirmNone")
          : t("install.deploy.confirm", { count: plan.agentKeys.length })}
      </Button>
    </div>
  );
}
