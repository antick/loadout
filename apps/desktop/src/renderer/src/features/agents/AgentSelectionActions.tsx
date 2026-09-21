import type { LocalSkill } from "@loadout/shared";
import { CircleMinus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useApplySkills } from "@/hooks/mutations/deploy";
import { useDeleteLocalSkills } from "@/hooks/mutations/workspace";
import { agentSkillRules } from "./agent-skill-rules";

export interface AgentSelectionActionsProps {
  agentKey: string;
  agentName: string;
  selected: readonly LocalSkill[];
  onDone: () => void;
}

/**
 * Batch actions of an agent's folder. Removing managed skills (the library keeps them) and
 * deleting unmanaged folders for good are two separate buttons, each with its own confirmation.
 */
export function AgentSelectionActions({
  agentKey,
  agentName,
  selected,
  onDone,
}: AgentSelectionActionsProps): ReactNode {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const apply = useApplySkills();
  const deleteMany = useDeleteLocalSkills();

  const managed = selected.filter((skill) => agentSkillRules(skill).remove);
  const localOnly = selected.filter((skill) => agentSkillRules(skill).deleteLocal);
  const busy = apply.isPending || deleteMany.isPending;

  const removeManaged = async (): Promise<void> => {
    const ok = await confirm({
      title: t("agents.confirm.removeManyTitle", { count: managed.length, agent: agentName }),
      description: t("agents.confirm.removeManyDescription", { count: managed.length }),
      items: managed.map((skill) => skill.name),
      confirmLabel: t("agents.batch.removeManaged", { count: managed.length }),
      destructive: true,
    });
    if (!ok) return;
    const skillIds = managed.flatMap((skill) => skill.librarySkillId ?? []);
    apply.mutate({ skillIds, agentKeys: [agentKey], action: "remove" }, { onSuccess: onDone });
  };

  const deleteLocalOnly = async (): Promise<void> => {
    const ok = await confirm({
      title: t("agents.confirm.deleteManyTitle", { count: localOnly.length }),
      description: t("agents.confirm.deleteManyDescription", { count: localOnly.length }),
      items: localOnly.map((skill) => skill.path),
      confirmLabel: t("agents.batch.deleteLocalOnly", { count: localOnly.length }),
      destructive: true,
    });
    if (!ok) return;
    deleteMany.mutate(
      localOnly.map((skill) => ({
        agentKey: skill.agentKey,
        relativePath: skill.relativePath,
        name: skill.name,
      })),
      { onSuccess: onDone },
    );
  };

  return (
    <>
      <Button
        size="xs"
        variant="outline"
        disabled={managed.length === 0 || busy}
        onClick={() => void removeManaged()}
      >
        {apply.isPending ? <Spinner /> : <CircleMinus />}
        {t("agents.batch.removeManaged", { count: managed.length })}
      </Button>
      <Button
        size="xs"
        variant="outline"
        className="text-danger hover:bg-danger/10 hover:text-danger"
        disabled={localOnly.length === 0 || busy}
        onClick={() => void deleteLocalOnly()}
      >
        {deleteMany.isPending ? <Spinner /> : <Trash2 />}
        {t("agents.batch.deleteLocalOnly", { count: localOnly.length })}
      </Button>
      {selected.length > managed.length + localOnly.length ? (
        <span className="truncate text-xs text-muted-foreground">
          {t("agents.batch.skippedHint", {
            count: selected.length - managed.length - localOnly.length,
          })}
        </span>
      ) : null}
    </>
  );
}
