import type { Skill } from "@loadout/shared";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useApplySkills } from "@/hooks/mutations/deploy";
import { useAvailableAgents } from "@/hooks/queries/agents";
import { cn } from "@/lib/utils";

export interface BatchDeployDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skills: readonly Skill[];
  onDone?: () => void;
}

/** The form lives in its own component so every opening starts with no agent ticked. */
function BatchDeployForm({
  onOpenChange,
  skills,
  onDone,
}: Omit<BatchDeployDialogProps, "open">): ReactNode {
  const { t } = useTranslation();
  const agents = useAvailableAgents();
  const apply = useApplySkills();
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());

  /** Per agent: how many of the selected skills it does not have yet. */
  const missingByAgent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const agent of agents.data ?? []) {
      counts.set(
        agent.key,
        skills.filter((skill) => !skill.deployments.some((d) => d.agentKey === agent.key)).length,
      );
    }
    return counts;
  }, [agents.data, skills]);

  const list = agents.data ?? [];
  const pairsToAdd = [...chosen].reduce((sum, key) => sum + (missingByAgent.get(key) ?? 0), 0);
  const allChosen = list.length > 0 && chosen.size === list.length;

  const toggle = (agentKey: string): void =>
    setChosen((previous) => {
      const next = new Set(previous);
      if (next.has(agentKey)) next.delete(agentKey);
      else next.add(agentKey);
      return next;
    });

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const agentKeys = [...chosen].filter((key) => (missingByAgent.get(key) ?? 0) > 0);
    // Only skills that are missing somewhere are sent; the backend skips pairs already in place.
    const skillIds = skills
      .filter((skill) =>
        agentKeys.some((key) => !skill.deployments.some((d) => d.agentKey === key)),
      )
      .map((skill) => skill.id);
    if (skillIds.length === 0 || agentKeys.length === 0) return;
    apply.mutate(
      { skillIds, agentKeys, action: "add" },
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
        <DialogTitle>{t("batchDeploy.title", { count: skills.length })}</DialogTitle>
        <DialogDescription>{t("batchDeploy.description")}</DialogDescription>
      </DialogHeader>

      <div className="flex items-center justify-between">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          {t("batchDeploy.agents")}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={list.length === 0}
          onClick={() => setChosen(allChosen ? new Set() : new Set(list.map((a) => a.key)))}
        >
          {allChosen ? t("selection.selectNone") : t("selection.selectAll")}
        </Button>
      </div>

      {agents.isPending ? (
        <div className="flex flex-col gap-1">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          {t("batchDeploy.noAgents")}
        </p>
      ) : (
        <ul className="-mx-1 flex max-h-72 flex-col gap-0.5 overflow-y-auto px-1">
          {list.map((agent) => {
            const missing = missingByAgent.get(agent.key) ?? 0;
            const checked = chosen.has(agent.key);
            return (
              <li key={agent.key}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/60",
                    checked && "bg-primary/5",
                  )}
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggle(agent.key)} />
                  <AgentAvatar agentKey={agent.key} name={agent.displayName} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm">{agent.displayName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {missing === 0
                      ? t("batchDeploy.hasAll")
                      : t("batchDeploy.missing", { count: missing })}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <DialogFooter className="items-center sm:justify-between">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {chosen.size === 0
            ? t("batchDeploy.pickHint")
            : t("batchDeploy.summary", { count: pairsToAdd })}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={pairsToAdd === 0 || apply.isPending}>
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
}: BatchDeployDialogProps): ReactNode {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <BatchDeployForm skills={skills} onOpenChange={onOpenChange} onDone={onDone} />
      </DialogContent>
    </Dialog>
  );
}
