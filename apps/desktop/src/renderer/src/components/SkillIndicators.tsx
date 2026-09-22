import type { Skill } from "@loadout/shared";
import { Link } from "@tanstack/react-router";
import { PencilLine, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SKILL_ITEM_RAISED_CLASS } from "@/components/skill-item";
import { StatusBadge } from "@/components/StatusBadge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UpdateStatusBadge } from "@/components/UpdateStatusBadge";
import { hasTrackedSource } from "@/lib/skill-source";
import { cn } from "@/lib/utils";

/**
 * Attention badges of a library skill: update state and an unresolved backup conflict. The
 * conflict badge is a link to the Backup page, where the conflict is resolved. Detail views also
 * say when a skill with an upstream was edited in the app, since updating it asks first.
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
      {showAll && skill.editedFiles.length > 0 && hasTrackedSource(skill) ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <StatusBadge
                tone="info"
                icon={<PencilLine />}
                label={t("skills.edited")}
                compact={compact}
              />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-64">{t("skills.editedHint")}</TooltipContent>
        </Tooltip>
      ) : null}
    </>
  );
}
