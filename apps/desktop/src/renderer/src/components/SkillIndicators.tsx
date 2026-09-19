import type { Skill } from "@skillboard/shared";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "@/components/StatusBadge";
import { UpdateStatusBadge } from "@/components/UpdateStatusBadge";

/** Attention badges of a library skill: update state and an unresolved backup conflict. */
export function SkillIndicators({
  skill,
  compact,
}: {
  skill: Skill;
  compact?: boolean;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <>
      <UpdateStatusBadge status={skill.updateStatus} compact={compact} />
      {skill.hasConflict ? (
        <StatusBadge
          tone="danger"
          icon={<TriangleAlert />}
          label={t("skills.conflict")}
          compact={compact}
        />
      ) : null}
    </>
  );
}
