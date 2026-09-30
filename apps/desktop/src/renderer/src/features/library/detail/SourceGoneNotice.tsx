import { REMOVED_KEEP_DAYS, type Skill } from "@loadout/shared";
import { Trash2, Unlink, UserCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { InlineNotice } from "@/components/InlineNotice";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useKeepSkillAsMine } from "@/hooks/mutations/library";

export interface SourceGoneNoticeProps {
  skill: Skill;
  /** Starts the usual delete, which asks first and keeps the skill in Recently removed. */
  onRemove: () => void;
}

/**
 * A skill whose source no longer has it (deleted or renamed upstream, a dead link): say so, and
 * offer the two ways out, keeping it as the user's own or removing it. Nothing else can update it.
 */
export function SourceGoneNotice({ skill, onRemove }: SourceGoneNoticeProps): ReactNode {
  const { t } = useTranslation();
  const keep = useKeepSkillAsMine();
  if (skill.updateStatus !== "source_missing") return null;

  return (
    <InlineNotice
      tone="warning"
      icon={Unlink}
      className="mx-6 mt-4"
      actions={
        <>
          <Button
            variant="outline"
            size="xs"
            disabled={keep.isPending}
            title={t("library.sourceGone.keepHint")}
            onClick={() => keep.mutate(skill.id)}
          >
            {keep.isPending ? <Spinner /> : <UserCheck />}
            {t("library.sourceGone.keep")}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            disabled={keep.isPending}
            title={t("library.sourceGone.removeHint", { days: REMOVED_KEEP_DAYS })}
            onClick={onRemove}
          >
            <Trash2 />
            {t("library.sourceGone.remove")}
          </Button>
        </>
      }
    >
      <p>{t("library.sourceGone.message")}</p>
      {skill.lastCheckError ? (
        <p className="mt-0.5 text-xs text-muted-foreground" data-selectable>
          {t("library.sourceGone.reason", { reason: skill.lastCheckError })}
        </p>
      ) : null}
    </InlineNotice>
  );
}
