import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SkillContextMenu } from "@/components/SkillContextMenu";
import {
  SKILL_ITEM_BASE_CLASS,
  SKILL_ITEM_HIT_CLASS,
  SKILL_ITEM_RAISED_CLASS,
  type SkillItemProps,
  skillItemClick,
} from "@/components/skill-item";
import { SkillIndicators } from "@/components/SkillIndicators";
import { SkillTags } from "@/components/SkillTags";
import { SourceBadge } from "@/components/SourceBadge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/** Grid variant of a library skill. */
export function SkillCard(props: SkillItemProps): ReactNode {
  const { skill, selecting, selected, onSelectToggle, current, actions, footer, className } = props;
  const { t } = useTranslation();

  return (
    <SkillContextMenu actions={props.menuActions} disabled={props.selecting}>
      <div
        data-selected={selected ?? false}
        data-current={current ?? false}
        className={cn(
          SKILL_ITEM_BASE_CLASS,
          "flex min-h-36 flex-col gap-2 rounded-lg p-3",
          className,
        )}
      >
        <button
          type="button"
          aria-label={skill.name}
          className={SKILL_ITEM_HIT_CLASS}
          onClick={skillItemClick(props)}
        />
        <div className="flex items-start gap-2">
          {onSelectToggle ? (
            <Checkbox
              checked={selected ?? false}
              aria-label={t("selection.selectItem", { name: skill.name })}
              onClick={(event) => onSelectToggle(skill, { shiftKey: event.shiftKey })}
              className={cn(
                SKILL_ITEM_RAISED_CLASS,
                "mt-0.5 transition-opacity",
                !selecting &&
                  "opacity-40 group-focus-within/skill:opacity-100 group-hover/skill:opacity-100",
              )}
            />
          ) : null}
          <h3 className="min-w-0 flex-1 truncate text-sm font-medium" title={skill.name}>
            {skill.name}
          </h3>
          <div className={cn(SKILL_ITEM_RAISED_CLASS, "flex shrink-0 items-center gap-1")}>
            <SkillIndicators skill={skill} compact />
            {actions}
          </div>
        </div>
        <p className="line-clamp-2 min-h-8 text-xs leading-4 text-muted-foreground">
          {skill.description ?? t("skills.noDescription")}
        </p>
        <div className="flex min-w-0 items-center gap-1.5">
          <SourceBadge source={skill.sourceType} />
          <SkillTags tags={skill.tags} />
        </div>
        {footer ? (
          <div className={cn(SKILL_ITEM_RAISED_CLASS, "mt-auto flex w-fit items-center pt-1")}>
            {footer}
          </div>
        ) : null}
      </div>
    </SkillContextMenu>
  );
}
