import type { Skill } from "@skillboard/shared";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "@/components/ConfirmDialog";
import { useRemoveSkills } from "@/hooks/mutations/skills";

/**
 * Ask, then delete library skills. The confirm spells out everything that goes with them.
 * Resolves to true when the delete was started.
 */
export function useDeleteSkills(): (skills: readonly Skill[]) => Promise<boolean> {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const remove = useRemoveSkills();
  const { mutate } = remove;

  return useCallback(
    async (skills) => {
      if (skills.length === 0) return false;
      const deployed = skills.reduce((sum, skill) => sum + skill.deployments.length, 0);
      const ok = await confirm({
        title:
          skills.length === 1
            ? t("library.delete.titleOne", { name: skills[0]?.name })
            : t("library.delete.titleMany", { count: skills.length }),
        description: [
          t("library.delete.description", { count: skills.length }),
          deployed > 0 ? t("library.delete.deployedCopies", { count: deployed }) : null,
          t("library.delete.irreversible"),
        ]
          .filter(Boolean)
          .join(" "),
        items: skills.length > 1 ? skills.map((skill) => skill.name) : undefined,
        confirmLabel: t("library.delete.confirm", { count: skills.length }),
        destructive: true,
      });
      if (!ok) return false;
      mutate(skills.map((skill) => skill.id));
      return true;
    },
    [confirm, mutate, t],
  );
}
