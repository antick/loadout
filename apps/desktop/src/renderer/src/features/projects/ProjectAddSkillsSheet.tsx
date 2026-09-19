import type { Project, ProjectTarget, Skill } from "@skillboard/shared";
import { Pin } from "lucide-react";
import { type ReactNode, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AddFromLibrarySheet, type PickerRowInfo } from "@/components/AddFromLibrarySheet";
import { Button } from "@/components/ui/button";
import { useExportSkills, useSetLastExportAgents } from "@/hooks/mutations/project-detail";
import { useLastExportAgents } from "@/hooks/queries/project-detail";
import { useSkills } from "@/hooks/queries/skills";
import {
  hasSkill,
  indexPresence,
  isFolderFree,
  orderedAvailableTargets,
  type ProjectSkillGroup,
  targetOfAgent,
} from "./project-skill-groups";

export interface ProjectAddSkillsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  targets: readonly ProjectTarget[];
  groups: readonly ProjectSkillGroup[];
}

/** The library picker for a project: choose skills and the agent folders they are copied into. */
export function ProjectAddSkillsSheet({
  open,
  onOpenChange,
  project,
  targets,
  groups,
}: ProjectAddSkillsSheetProps): ReactNode {
  const { t } = useTranslation();
  const library = useSkills();
  const lastExport = useLastExportAgents(project.id);
  const exportSkills = useExportSkills();
  const saveDefaults = useSetLastExportAgents();

  const available = useMemo(() => orderedAvailableTargets(targets), [targets]);
  const presence = useMemo(() => indexPresence(groups), [groups]);

  // The saved choice, minus agents that are gone; nothing saved means every available target.
  const initialAgentKeys = useMemo(() => {
    const saved = (lastExport.data ?? []).filter((key) => targetOfAgent(available, key));
    return saved.length > 0 ? saved : undefined;
  }, [lastExport.data, available]);

  const chosenTargets = useCallback(
    (agentKeys: readonly string[]): ProjectTarget[] => [
      ...new Set(agentKeys.flatMap((key) => targetOfAgent(available, key) ?? [])),
    ],
    [available],
  );

  const rowState = useCallback(
    (skill: Skill, agentKeys: readonly string[]): PickerRowInfo => {
      const chosen = chosenTargets(agentKeys);
      if (chosen.length === 0) return { state: "available" };
      const missing = chosen.filter((target) => !hasSkill(presence, skill.id, target.key));
      if (missing.length === 0) return { state: "installed" };
      const free = missing.filter((target) => isFolderFree(presence, skill.dirName, target.key));
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
            targets: free.map((target) => target.displayName).join(", "),
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
      const free = chosen.filter(
        (target) =>
          !hasSkill(presence, skill.id, target.key) &&
          isFolderFree(presence, skill.dirName, target.key),
      );
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
