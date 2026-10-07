import { formatNameList } from "@loadout/shared";
import type { Project, ProjectTarget, Skill } from "@loadout/shared";
import { Pin } from "lucide-react";
import { type ReactNode, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AddFromLibrarySheet, type PickerRowInfo } from "@/components/AddFromLibrarySheet";
import { Button } from "@/components/ui/button";
import {
  useExportSkills,
  useSetLastExportAgents,
} from "@/features/projects/project-skill-mutations";
import { useLastExportAgents } from "@/hooks/queries/project-skills";
import { useSkills } from "@/hooks/queries/skills";
import {
  freeTargets,
  hasSkill,
  indexPresence,
  orderedAvailableTargets,
  preferredTargets,
  type ProjectSkillGroup,
  targetsOfAgents,
} from "./project-skill-groups";

export interface ProjectAddSkillsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  targets: readonly ProjectTarget[];
  groups: readonly ProjectSkillGroup[];
  /** Skills ticked when the sheet opens, e.g. the suggestions the user chose to add. */
  initialSkillIds?: readonly string[];
  /** Why a skill is suggested for the project, by skill id: listed first, with the reason. */
  suggested?: ReadonlyMap<string, string>;
}

/** The library picker for a project: choose skills and the agent folders they are copied into. */
export function ProjectAddSkillsSheet({
  open,
  onOpenChange,
  project,
  targets,
  groups,
  initialSkillIds,
  suggested,
}: ProjectAddSkillsSheetProps): ReactNode {
  const { t } = useTranslation();
  const library = useSkills();
  const lastExport = useLastExportAgents(project.id);
  const exportSkills = useExportSkills();
  const saveDefaults = useSetLastExportAgents();

  const available = useMemo(() => orderedAvailableTargets(targets), [targets]);
  const presence = useMemo(() => indexPresence(groups), [groups]);

  // The saved choice, minus agents that are gone; nothing saved means every available target.
  const initialAgentKeys = useMemo(
    () => preferredTargets(available, lastExport.data ?? []).flatMap((target) => target.agentKeys),
    [lastExport.data, available],
  );

  const chosenTargets = useCallback(
    (agentKeys: readonly string[]): ProjectTarget[] => targetsOfAgents(available, agentKeys),
    [available],
  );

  const rowState = useCallback(
    (skill: Skill, agentKeys: readonly string[]): PickerRowInfo => {
      const chosen = chosenTargets(agentKeys);
      if (chosen.length === 0) return { state: "available" };
      const missing = chosen.filter((target) => !hasSkill(presence, skill.id, target.key));
      if (missing.length === 0) return { state: "installed" };
      const free = freeTargets(presence, skill, missing);
      if (free.length === 0) {
        return {
          state: "unavailable",
          hint: t("projectPage.add.folderTaken", { dir: skill.dirName }),
        };
      }
      if (free.length < chosen.length) {
        return {
          state: "available",
          hint: t("projectPage.add.partly", {
            targets: formatNameList(free.map((target) => target.displayName)),
          }),
        };
      }
      return { state: "available" };
    },
    [chosenTargets, presence, t],
  );

  const submit = (skillIds: string[], agentKeys: string[]): Promise<unknown> => {
    const chosen = chosenTargets(agentKeys);
    const jobs = skillIds.flatMap((skillId) => {
      const skill = library.data?.find((entry) => entry.id === skillId);
      if (!skill) return [];
      // An export is all-or-nothing per call, so only ask for the folders that are still free.
      const free = freeTargets(presence, skill, chosen);
      if (free.length === 0) return [];
      return [{ skillId, name: skill.name, agentKeys: free.map((target) => target.key) }];
    });
    return exportSkills.mutateAsync({ projectId: project.id, jobs });
  };

  return (
    <AddFromLibrarySheet
      open={open}
      onOpenChange={onOpenChange}
      target={{ kind: "project", projectId: project.id, targets: available, initialAgentKeys }}
      title={t("projectPage.add.title", { project: project.name })}
      description={t("projectPage.add.description")}
      rowState={rowState}
      onSubmit={submit}
      initialSelectedIds={initialSkillIds}
      featured={suggested}
      renderFooterStart={(agentKeys) =>
        available.length > 1 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={agentKeys.length === 0 || saveDefaults.isPending}
            onClick={() =>
              saveDefaults.mutate({
                projectId: project.id,
                agentKeys: chosenTargets(agentKeys).map((target) => target.key),
              })
            }
          >
            <Pin />
            {t("projectPage.add.saveDefault")}
          </Button>
        ) : null
      }
    />
  );
}
