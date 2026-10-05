import type { Skill } from "@loadout/shared";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { deployPlan, missingCount } from "@/components/agent-checklist";
import { AgentChecklist } from "@/components/AgentChecklist";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useApplySkills } from "@/hooks/mutations/deploy";
import { useAvailableAgents } from "@/hooks/queries/agents";

export interface BatchDeployDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skills: readonly Skill[];
  onDone?: () => void;
  /**
   * The whole library rather than a selection: every agent that is missing something starts
   * ticked, and folders Loadout did not create are left alone instead of stopping the deploy.
   */
  all?: boolean;
}

/** The form lives in its own component so every opening starts with no agent ticked. */
function BatchDeployForm({
  onOpenChange,
  skills,
  onDone,
  all = false,
}: Omit<BatchDeployDialogProps, "open">): ReactNode {
  const { t } = useTranslation();
  const agents = useAvailableAgents();
  const apply = useApplySkills();
  const [picked, setChosen] = useState<ReadonlySet<string> | null>(null);

  // For the whole library, every agent that is missing something starts ticked; the user's own
  // choice replaces that as soon as they make one.
  const defaults = useMemo<ReadonlySet<string>>(
    () =>
      new Set(
        all
          ? (agents.data ?? [])
              .filter((agent) => missingCount(skills, agent.key) > 0)
              .map((agent) => agent.key)
          : [],
      ),
    [all, agents.data, skills],
  );
  const chosen = picked ?? defaults;
  const plan = deployPlan(skills, chosen);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (plan.pairs === 0) return;
    // Only skills that are missing somewhere are sent; the backend skips pairs already in place.
    apply.mutate(
      { skillIds: plan.skillIds, agentKeys: plan.agentKeys, action: "add", skipConflicts: all },
      {
        onSuccess: () => {
          onOpenChange(false);
          onDone?.();
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="contents">
      <DialogHeader>
        <DialogTitle>
          {all ? t("batchDeploy.titleAll") : t("batchDeploy.title", { count: skills.length })}
        </DialogTitle>
        <DialogDescription>
          {t(all ? "batchDeploy.descriptionAll" : "batchDeploy.description")}
        </DialogDescription>
      </DialogHeader>

      <AgentChecklist
        skills={skills}
        chosen={chosen}
        onChange={setChosen}
        listClassName="max-h-72"
      />

      <DialogFooter className="items-center sm:justify-between">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {chosen.size === 0
            ? t("batchDeploy.pickHint")
            : t("batchDeploy.summary", { count: plan.pairs })}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={plan.pairs === 0 || apply.isPending}>
            {apply.isPending ? <Spinner /> : null}
            {t("batchDeploy.submit")}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

/** Install several library skills for several agents at once. Only missing pairs are added. */
export function BatchDeployDialog({
  open,
  onOpenChange,
  skills,
  onDone,
  all,
}: BatchDeployDialogProps): ReactNode {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <BatchDeployForm skills={skills} onOpenChange={onOpenChange} onDone={onDone} all={all} />
      </DialogContent>
    </Dialog>
  );
}
