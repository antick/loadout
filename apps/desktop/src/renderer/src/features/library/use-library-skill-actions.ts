import type { Skill } from "@loadout/shared";
import { useNavigate } from "@tanstack/react-router";
import { FolderOpen, PencilLine, RefreshCw, Trash2 } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { EDIT_ACTION_ID, type SkillAction } from "@/components/skill-action";
import { useDeleteSkills } from "@/features/library/use-delete-skills";
import { useCheckSkillUpdate, useRevealSkill } from "@/hooks/mutations/library";
import { hasTrackedSource } from "@/lib/skill-source";
import { editLink } from "@/lib/skill-location";

/** What a library skill's right-click menu offers; "edit" also runs on double-click. */
export function useLibrarySkillActions(): (skill: Skill) => SkillAction[] {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const reveal = useRevealSkill();
  const check = useCheckSkillUpdate();
  const deleteSkills = useDeleteSkills();

  return useCallback(
    (skill: Skill): SkillAction[] => {
      const actions: SkillAction[] = [
        {
          id: EDIT_ACTION_ID,
          label: t("editor.open"),
          icon: PencilLine,
          run: () => void navigate(editLink({ kind: "library", skillId: skill.id })),
        },
        {
          id: "reveal",
          label: t("library.detail.reveal"),
          icon: FolderOpen,
          run: () => reveal.mutate(skill.id),
        },
      ];
      if (hasTrackedSource(skill)) {
        actions.push({
          id: "check",
          label: t("library.source.checkNow"),
          icon: RefreshCw,
          run: () => check.mutate(skill.id),
        });
      }
      actions.push({
        id: "delete",
        label: t("library.detail.delete"),
        icon: Trash2,
        destructive: true,
        run: () => void deleteSkills([skill]),
      });
      return actions;
    },
    [t, navigate, reveal, check, deleteSkills],
  );
}
