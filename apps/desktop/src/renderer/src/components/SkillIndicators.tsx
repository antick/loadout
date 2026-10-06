import { hasTrackedSource } from "@loadout/shared";
import type { Skill } from "@loadout/shared";
import { FileWarning, PencilLine, StickyNote, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ManualOnlyBadge } from "@/components/ManualOnlyBadge";
import { SKILL_ITEM_RAISED_CLASS } from "@/components/skill-item";
import { SkillTraitBadges } from "@/components/SkillTraitBadges";
import { StatusBadge } from "@/components/StatusBadge";
import { UpdateStatusBadge } from "@/components/UpdateStatusBadge";
import { SafetyVerdictBadge } from "@/features/safety/SafetyReportView";
import { useSafetyReports } from "@/hooks/queries/safety";
import { editLink } from "@/lib/skill-location";

/**
 * Attention badges of a library skill: update state, a SKILL.md that breaks the format (a link to
 * the editor), and an unresolved backup conflict (a link to the Backup page). Detail views also
 * count format warnings and say when a skill with an upstream was edited in the app. A skill
 * agents only run on request is marked everywhere, since it behaves differently once deployed.
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
      {skill.manualOnly ? <ManualOnlyBadge compact={compact} /> : null}
      {skill.note ? (
        // The user's own note, shown in full on hover.
        <StatusBadge
          tone="neutral"
          icon={<StickyNote />}
          label={t("library.note.badge")}
          compact={compact}
          hint={<p className="whitespace-pre-wrap">{skill.note}</p>}
        />
      ) : null}
      <SkillTraitBadges traits={skill.traits} compact={compact} showAll={showAll} />
      {skill.hasConflict ? (
        <StatusBadge
          tone="danger"
          icon={<TriangleAlert />}
          label={t("skills.conflict")}
          compact={compact}
          link={{ to: "/backup" }}
          className={SKILL_ITEM_RAISED_CLASS}
        />
      ) : null}
      {showAll && skill.editedFiles.length > 0 && hasTrackedSource(skill) ? (
        <StatusBadge
          tone="info"
          icon={<PencilLine />}
          label={t("skills.edited")}
          compact={compact}
          hint={t("skills.editedHint")}
        />
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
      <StatusBadge
        tone="danger"
        icon={<FileWarning />}
        label={t("checks.badge")}
        compact={compact}
        hint={t("checks.badgeHint")}
        link={editLink({ kind: "library", skillId: skill.id })}
        className={SKILL_ITEM_RAISED_CLASS}
      />
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
