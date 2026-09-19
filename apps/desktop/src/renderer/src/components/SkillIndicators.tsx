import type { Skill } from "@skillboard/shared";
import { Link } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SKILL_ITEM_RAISED_CLASS } from "@/components/skill-item";
import { StatusBadge } from "@/components/StatusBadge";
import { UpdateStatusBadge } from "@/components/UpdateStatusBadge";
import { cn } from "@/lib/utils";

/**
 * Attention badges of a library skill: update state and an unresolved backup conflict. The
 * conflict badge is a link to the Backup page, where the conflict is resolved.
 */
export function SkillIndicators({
  skill,
  compact,
  showAll,
}: {
  skill: Skill;
  compact?: boolean;
  /** Also show quiet update states such as "Up to date" (detail views). */
  showAll?: boolean;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <>
      <UpdateStatusBadge status={skill.updateStatus} compact={compact} showAll={showAll} />
      {skill.hasConflict ? (
        <Link
          to="/backup"
          aria-label={t("skills.conflict")}
          className={cn(
            SKILL_ITEM_RAISED_CLASS,
            "inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          )}
        >
          <StatusBadge
            tone="danger"
            icon={<TriangleAlert />}
            label={t("skills.conflict")}
            compact={compact}
          />
        </Link>
      ) : null}
    </>
  );
}
