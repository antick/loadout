import type { Preset, Project, ProjectTarget } from "@skillboard/shared";
import { type ReactNode, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { PresetBarSection } from "@/features/local-skills/PresetBarSection";
import { useDeleteVariants, useExportSkills } from "@/hooks/mutations/project-detail";
import { usePresets } from "@/hooks/queries/presets";
import { useSkills } from "@/hooks/queries/skills";
import type { SkillAgentPair } from "@/lib/preset-state";
import {
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
  const { mutateAsync: deleteVariants } = useDeleteVariants();

  const targetKeys = useMemo(
    () => orderedAvailableTargets(targets ?? []).map((target) => target.key),
    [targets],
  );
  const presence = useMemo(() => indexPresence(groups), [groups]);
  const exists = useCallback(
    (skillId: string, targetKey: string) => hasSkill(presence, skillId, targetKey),
    [presence],
  );

  if (!targets || !presets.data || !skills.data) return null;
  const library = skills.data;

  const activate = (_preset: Preset, missing: SkillAgentPair[]): Promise<unknown> =>
    exportSkills({
      projectId: project.id,
      jobs: missing.map((pair) => ({
        skillId: pair.skillId,
        name: library.find((skill) => skill.id === pair.skillId)?.name ?? pair.skillId,
        agentKeys: [pair.agentKey],
      })),
    });

  const deactivate = async (preset: Preset, present: SkillAgentPair[]): Promise<unknown> => {
    const jobs = present.flatMap((pair) =>
      groups.flatMap((group) =>
        group.variants
          .filter(
            (variant) =>
              variant.librarySkillId === pair.skillId && variant.agentKey === pair.agentKey,
          )
          .map((variant) => ({
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
    return deleteVariants({ projectId: project.id, jobs });
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
