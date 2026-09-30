import type { PublishPlan, PublishSkillPlan, PublishStatus } from "@loadout/shared";
import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { InlineNotice } from "@/components/InlineNotice";
import { type StatusTone, StatusBadge } from "@/components/StatusBadge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const STATUS_TONES: Record<PublishStatus, StatusTone> = {
  new: "success",
  changed: "info",
  unchanged: "neutral",
  skipped: "warning",
};
/** Findings listed before "and N more"; the count on the checkbox covers the rest. */
const SECRETS_SHOWN = 4;

function SkillLine({ skill }: { skill: PublishSkillPlan }): ReactNode {
  const { t } = useTranslation();
  const { added, changed, removed } = skill.files;
  const detail =
    skill.status === "skipped"
      ? skill.reason
      : skill.status === "changed"
        ? t("publish.plan.changes", { added, changed, removed })
        : null;
  const more = skill.leftOutCount - skill.leftOut.length;
  return (
    <li className="flex flex-col gap-0.5 rounded-md px-2 py-1.5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium" data-selectable>
          {skill.name}
        </span>
        <StatusBadge
          tone={STATUS_TONES[skill.status]}
          label={t(`publish.status.${skill.status}`)}
        />
      </div>
      {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      {skill.leftOutCount > 0 ? (
        <p className="text-xs text-muted-foreground" data-selectable>
          {t("publish.plan.leftOut", { names: skill.leftOut.join(", ") })}
          {more > 0 ? ` ${t("common.andMore", { count: more })}` : ""}
        </p>
      ) : null}
    </li>
  );
}

export interface PublishPlanListProps {
  plan: PublishPlan;
  allowSecrets: boolean;
  onAllowSecrets: (allowed: boolean) => void;
}

/** What publishing would do: where it goes, each skill's status, and any key found in them. */
export function PublishPlanList({
  plan,
  allowSecrets,
  onAllowSecrets,
}: PublishPlanListProps): ReactNode {
  const { t } = useTranslation();
  const shown = plan.secrets.slice(0, SECRETS_SHOWN);
  return (
    <section className="flex flex-col gap-2" aria-label={t("publish.plan.title")}>
      <p className="text-xs text-muted-foreground" data-selectable>
        {plan.repoEmpty
          ? t("publish.plan.emptyRepo", { branch: plan.target.branch })
          : plan.newBranch
            ? t("publish.plan.newBranch", { branch: plan.target.branch })
            : t("publish.plan.branch", { branch: plan.target.branch })}
      </p>
      <ul className="-mx-2 flex max-h-56 flex-col overflow-y-auto">
        {plan.skills.map((skill) => (
          <SkillLine key={skill.skillId} skill={skill} />
        ))}
      </ul>
      {plan.secrets.length > 0 ? (
        <InlineNotice tone="warning" icon={AlertTriangle}>
          <p className="font-medium">
            {t("publish.secrets.title", { count: plan.secrets.length })}
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 font-mono text-xs" data-selectable>
            {shown.map((finding) => (
              <li key={finding.id} className="truncate">
                {finding.file}:{finding.line} {t(`backupPage.secrets.kind.${finding.kind}`)}
              </li>
            ))}
          </ul>
          {plan.secrets.length > shown.length ? (
            <p className="mt-1 text-xs">
              {t("common.andMore", { count: plan.secrets.length - shown.length })}
            </p>
          ) : null}
          <Label className="mt-2 items-start gap-2 font-normal">
            <Checkbox
              className="mt-0.5"
              checked={allowSecrets}
              onCheckedChange={(checked) => onAllowSecrets(checked === true)}
            />
            <span>{t("publish.secrets.allow")}</span>
          </Label>
        </InlineNotice>
      ) : null}
    </section>
  );
}
