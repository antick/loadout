import type { Skill } from "@loadout/shared";
import { Link } from "@tanstack/react-router";
import { FileWarning, PencilLine, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SKILL_ITEM_RAISED_CLASS } from "@/components/skill-item";
import { StatusBadge } from "@/components/StatusBadge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UpdateStatusBadge } from "@/components/UpdateStatusBadge";
import { SafetyVerdictBadge } from "@/features/safety/SafetyReportView";
import { useSafetyReports } from "@/hooks/queries/safety";
import { hasTrackedSource } from "@/lib/skill-source";
import { cn } from "@/lib/utils";

/**
 * Attention badges of a library skill: update state, a SKILL.md that breaks the format (a link to
 * the editor), and an unresolved backup conflict (a link to the Backup page). Detail views also
 * count format warnings and say when a skill with an upstream was edited in the app.
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
      <CheckBadges skill={skill} compact={compact} showAll={showAll} />
      <SafetyBadge skill={skill} compact={compact} showAll={showAll} />
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

/**
 * The last safety check. Lists show only what needs a look (flagged, to review) and only while it
 * still holds; detail views show every verdict, stale ones marked.
 */
function SafetyBadge({
  skill,
  compact,
  showAll,
}: {
  skill: Skill;
  compact?: boolean;
  showAll?: boolean;
}): ReactNode {
  const record = useSafetyReports().get(skill.id);
  if (!record) return null;
  if (!showAll && (record.stale || record.verdict === "safe")) return null;
  return <SafetyVerdictBadge verdict={record.verdict} compact={compact} stale={record.stale} />;
}

/** Errors on every view (they keep agents from using the skill); warnings only in detail views. */
function CheckBadges({
  skill,
  compact,
  showAll,
}: {
  skill: Skill;
  compact?: boolean;
  showAll?: boolean;
}): ReactNode {
  const { t } = useTranslation();
  const errors = skill.issues.filter((issue) => issue.severity === "error").length;
  const warnings = skill.issues.length - errors;
  if (errors > 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to="/library/$skillId/edit"
            params={{ skillId: skill.id }}
            aria-label={t("checks.badge")}
            className={cn(
              SKILL_ITEM_RAISED_CLASS,
              "inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            )}
          >
            <StatusBadge
              tone="danger"
              icon={<FileWarning />}
              label={t("checks.badge")}
              compact={compact}
            />
          </Link>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">{t("checks.badgeHint")}</TooltipContent>
      </Tooltip>
    );
  }
  if (!showAll || warnings === 0) return null;
  return (
    <StatusBadge
      tone="warning"
      icon={<TriangleAlert />}
      label={t("checks.warnings", { count: warnings })}
      compact={compact}
    />
  );
}
