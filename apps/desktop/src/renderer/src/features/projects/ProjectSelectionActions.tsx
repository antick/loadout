import type { Project } from "@loadout/shared";
import { ArrowDownToLine, ArrowUpFromLine, Eye, EyeOff, Tags, Trash2 } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BatchTagDialog } from "@/components/BatchTagDialog";
import { useConfirm } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  type ProjectSkillRef,
  useDeleteProjectSkills,
  usePullManyFromLibrary,
  usePushManyToLibrary,
  useSetProjectSkillsEnabled,
} from "@/hooks/mutations/project-detail";
import { useSkills } from "@/hooks/queries/skills";
import { type ProjectSkillGroup, projectSkillRules } from "./project-skill-groups";

export interface ProjectSelectionActionsProps {
  project: Project;
  selected: readonly ProjectSkillGroup[];
  onDone: () => void;
}

/** Batch actions for the selected project skills. Each button counts only the skills it applies to. */
export function ProjectSelectionActions({
  project,
  selected,
  onDone,
}: ProjectSelectionActionsProps): ReactNode {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const library = useSkills();
  const setEnabled = useSetProjectSkillsEnabled();
  const pullMany = usePullManyFromLibrary();
  const pushMany = usePushManyToLibrary();
  const deleteMany = useDeleteProjectSkills();
  const [tagging, setTagging] = useState(false);

  const refOf = (group: ProjectSkillGroup): ProjectSkillRef => ({
    projectId: project.id,
    relativePath: group.relativePath,
    name: group.name,
  });
  const toEnable = selected.filter((group) => group.enabledState !== "all");
  const toDisable = selected.filter((group) => group.enabledState !== "none");
  const toPull = selected.filter((group) => projectSkillRules(group).pull);
  const toPush = selected.filter((group) => projectSkillRules(group).push);
  // Tags belong to library skills, so only linked skills can be tagged from here.
  const linkedSkills = useMemo(() => {
    const ids = new Set(selected.flatMap((group) => group.librarySkillId ?? []));
    return (library.data ?? []).filter((skill) => ids.has(skill.id));
  }, [selected, library.data]);

  const busy =
    setEnabled.isPending || pullMany.isPending || pushMany.isPending || deleteMany.isPending;
  const done = { onSuccess: onDone };

  const updateProject = async (): Promise<void> => {
    const diverged = toPull.filter((group) => group.syncStatus === "diverged");
    if (diverged.length > 0) {
      const ok = await confirm({
        title: t("projectPage.confirm.pullManyTitle", { count: toPull.length }),
        description: t("projectPage.confirm.pullManyDescription", { count: diverged.length }),
        items: diverged.map((group) => group.name),
        confirmLabel: t("projectPage.batch.pull", { count: toPull.length }),
        destructive: true,
      });
      if (!ok) return;
    }
    pullMany.mutate(toPull.map(refOf), done);
  };

  const deleteSelected = async (): Promise<void> => {
    const ok = await confirm({
      title: t("projectPage.confirm.deleteManyTitle", { count: selected.length }),
      description: t("projectPage.confirm.deleteManyDescription", { project: project.name }),
      items: selected.map((group) => group.relativePath),
      confirmLabel: t("projectPage.batch.delete", { count: selected.length }),
      destructive: true,
    });
    if (ok) deleteMany.mutate(selected.map(refOf), done);
  };

  return (
    <>
      {project.supportsToggle ? (
        <>
          <Button
            size="xs"
            variant="outline"
            disabled={toEnable.length === 0 || busy}
            onClick={() => setEnabled.mutate({ refs: toEnable.map(refOf), enabled: true }, done)}
          >
            <Eye />
            {t("projectPage.batch.enable", { count: toEnable.length })}
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={toDisable.length === 0 || busy}
            onClick={() => setEnabled.mutate({ refs: toDisable.map(refOf), enabled: false }, done)}
          >
            <EyeOff />
            {t("projectPage.batch.disable", { count: toDisable.length })}
          </Button>
        </>
      ) : null}
      <Button
        size="xs"
        variant="outline"
        disabled={toPull.length === 0 || busy}
        onClick={() => void updateProject()}
      >
        <ArrowDownToLine />
        {t("projectPage.batch.pull", { count: toPull.length })}
      </Button>
      <Button
        size="xs"
        variant="outline"
        disabled={toPush.length === 0 || busy}
        onClick={() => pushMany.mutate(toPush.map(refOf), done)}
      >
        <ArrowUpFromLine />
        {t("projectPage.batch.push", { count: toPush.length })}
      </Button>
      <Tooltip>
        {/* The span keeps the hint reachable while the button is disabled. */}
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button
              size="xs"
              variant="outline"
              disabled={linkedSkills.length === 0 || busy}
              onClick={() => setTagging(true)}
            >
              <Tags />
              {t("projectPage.batch.tags", { count: linkedSkills.length })}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{t("projectPage.batch.tagsHint")}</TooltipContent>
      </Tooltip>
      <Button
        size="xs"
        variant="outline"
        className="text-danger hover:bg-danger/10 hover:text-danger"
        disabled={selected.length === 0 || busy}
        onClick={() => void deleteSelected()}
      >
        <Trash2 />
        {t("projectPage.batch.delete", { count: selected.length })}
      </Button>

      <BatchTagDialog open={tagging} onOpenChange={setTagging} skills={linkedSkills} />
    </>
  );
}
