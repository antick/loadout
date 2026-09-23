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

/** List variant of a library skill. Same props as `SkillCard`; `footer` sits on the right. */
export function SkillRow(props: SkillItemProps): ReactNode {
  const { skill, selecting, selected, onSelectToggle, current, actions, footer, className } = props;
  const { t } = useTranslation();

  return (
    <SkillContextMenu actions={props.menuActions} disabled={props.selecting}>
      <div
        data-selected={selected ?? false}
        data-current={current ?? false}
        className={cn(
          SKILL_ITEM_BASE_CLASS,
          "flex items-center gap-3 rounded-lg px-3 py-2",
          className,
        )}
      >
        <button
          type="button"
          aria-label={skill.name}
          className={SKILL_ITEM_HIT_CLASS}
          onClick={skillItemClick(props)}
        />
        {onSelectToggle ? (
          <Checkbox
            checked={selected ?? false}
            aria-label={t("selection.selectItem", { name: skill.name })}
            onClick={(event) => onSelectToggle(skill, { shiftKey: event.shiftKey })}
            className={cn(
              SKILL_ITEM_RAISED_CLASS,
              "transition-opacity",
              !selecting &&
                "opacity-40 group-focus-within/skill:opacity-100 group-hover/skill:opacity-100",
            )}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-medium" title={skill.name}>
              {skill.name}
            </h3>
            <SkillIndicators skill={skill} compact />
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {skill.description ?? t("skills.noDescription")}
          </p>
        </div>
        <div className="hidden min-w-0 shrink items-center gap-1.5 lg:flex">
          <SkillTags tags={skill.tags} max={2} />
          <SourceBadge source={skill.sourceType} compact />
        </div>
        {footer ? <div className={cn(SKILL_ITEM_RAISED_CLASS, "shrink-0")}>{footer}</div> : null}
        {actions ? (
          <div className={cn(SKILL_ITEM_RAISED_CLASS, "flex shrink-0 items-center gap-1")}>
            {actions}
          </div>
        ) : null}
      </div>
    </SkillContextMenu>
  );
}
