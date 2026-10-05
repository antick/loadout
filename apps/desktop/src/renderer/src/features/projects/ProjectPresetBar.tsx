import type { Preset, Project, ProjectTarget } from "@loadout/shared";
import { type ReactNode, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import { PresetBarSection } from "@/features/local-skills/PresetBarSection";
import {
  type ExportJob,
  useDeleteProjectSkills,
  useExportSkills,
} from "@/features/projects/project-skill-mutations";
import { usePresets } from "@/hooks/queries/presets";
import { useSkills } from "@/hooks/queries/skills";
import type { SkillAgentPair } from "@/lib/preset-state";
import {
  freeTargets,
  hasSkill,
  indexPresence,
  orderedAvailableTargets,
  type ProjectSkillGroup,
} from "./project-skill-groups";

export interface ProjectPresetBarProps {
  project: Project;
  /** Undefined until the targets have loaded; the bar stays hidden until then. */
  targets: readonly ProjectTarget[] | undefined;
  groups: readonly ProjectSkillGroup[];
}

/**
 * Preset pills for a project. A preset skill counts once every available target holds a copy
 * linked to it. Activating exports each missing skill × target pair; deactivating deletes the
 * matching copies after a confirmation.
 */
export function ProjectPresetBar({ project, targets, groups }: ProjectPresetBarProps): ReactNode {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const presets = usePresets();
  const skills = useSkills();
  const { mutateAsync: exportSkills } = useExportSkills();
  const { mutateAsync: deleteSkills } = useDeleteProjectSkills();

  const available = useMemo(() => orderedAvailableTargets(targets ?? []), [targets]);
  const targetKeys = useMemo(() => available.map((target) => target.key), [available]);
  const presence = useMemo(() => indexPresence(groups), [groups]);
  const exists = useCallback(
    (skillId: string, targetKey: string) => hasSkill(presence, skillId, targetKey),
    [presence],
  );

  if (!targets || !presets.data || !skills.data) return null;
  const library = skills.data;

  // Every available target, not the remembered ones: the pill counts a skill once all hold it.
  // Folders another skill already uses are skipped, as an export there would be refused.
  const activate = async (_preset: Preset, missing: SkillAgentPair[]): Promise<unknown> => {
    const jobs: ExportJob[] = [];
    const taken: string[] = [];
    for (const skillId of new Set(missing.map((pair) => pair.skillId))) {
      const skill = library.find((entry) => entry.id === skillId);
      if (!skill) continue;
      const wanted = available.filter((target) =>
        missing.some((pair) => pair.skillId === skillId && pair.agentKey === target.key),
      );
      const free = freeTargets(presence, skill, wanted);
      if (free.length < wanted.length) taken.push(skill.dirName);
      if (free.length > 0) {
        jobs.push({ skillId, name: skill.name, agentKeys: free.map((target) => target.key) });
      }
    }
    if (taken.length > 0) {
      toast.warning(t("projectPage.toast.presetFoldersTaken", { dirs: taken.join(", ") }));
    }
    return jobs.length > 0 ? exportSkills({ projectId: project.id, jobs }) : undefined;
  };

  const deactivate = async (preset: Preset, present: SkillAgentPair[]): Promise<unknown> => {
    const jobs = present.flatMap((pair) =>
      groups.flatMap((group) =>
        group.variants
          .filter(
            (variant) =>
              variant.librarySkillId === pair.skillId && variant.agentKey === pair.agentKey,
          )
          .map((variant) => ({
            projectId: project.id,
            relativePath: variant.relativePath,
            agentKey: variant.agentKey,
            name: variant.name,
            path: variant.path,
          })),
      ),
    );
    const ok = await confirm({
      title: t("projectPage.confirm.presetRemoveTitle", { preset: preset.name }),
      description: t("projectPage.confirm.presetRemoveDescription", {
        count: jobs.length,
        project: project.name,
      }),
      items: jobs.map((job) => job.path),
      confirmLabel: t("projectPage.confirm.presetRemoveConfirm", { count: jobs.length }),
      destructive: true,
    });
    if (!ok) return undefined;
    return deleteSkills(jobs);
  };

  return (
    <PresetBarSection
      presets={presets.data}
      skills={library}
      agentKeys={targetKeys}
      exists={exists}
      mode="logical-skill"
      onActivate={activate}
      onDeactivate={deactivate}
      hint={t("projectPage.presetsHint", { count: targetKeys.length })}
    />
  );
}
