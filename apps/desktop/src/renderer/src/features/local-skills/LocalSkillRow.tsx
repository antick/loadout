import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { editOnDoubleClick } from "@/components/skill-action";
import { SkillContextMenu } from "@/components/SkillContextMenu";
import {
  SKILL_ITEM_BASE_CLASS,
  SKILL_ITEM_HIT_CLASS,
  SKILL_ITEM_RAISED_CLASS,
} from "@/components/skill-item";
import { SkillTags } from "@/components/SkillTags";
import { cn } from "@/lib/utils";
import { type LocalSkillItemProps, localSkillItemClick } from "./local-skill-item";
import { LocalSkillMeta } from "./LocalSkillMeta";
import { LocalSkillSelectBox } from "./LocalSkillSelectBox";

/** List variant of a skill found on disk. Same props as `LocalSkillCard`. */
export function LocalSkillRow(props: LocalSkillItemProps): ReactNode {
  const { item, selected, current, badges, actions, footer } = props;
  const { t } = useTranslation();

  return (
    <SkillContextMenu actions={props.menuActions} disabled={props.selecting}>
      <div
        data-selected={selected ?? false}
        data-current={current ?? false}
        className={cn(
          SKILL_ITEM_BASE_CLASS,
          "flex items-center gap-3 rounded-lg px-3 py-2",
          item.enabledState === "none" && "bg-muted/30",
          props.className,
        )}
      >
        <button
          type="button"
          aria-label={item.name}
          className={SKILL_ITEM_HIT_CLASS}
          onClick={localSkillItemClick(props)}
          onDoubleClick={editOnDoubleClick(props.menuActions, props.selecting)}
        />
        <LocalSkillSelectBox
          item={item}
          selecting={props.selecting}
          selected={selected}
          onSelectToggle={props.onSelectToggle}
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3
              className={cn(
                "truncate text-sm font-medium",
                item.enabledState === "none" && "text-muted-foreground",
              )}
              title={item.relativePath}
            >
              {item.name}
            </h3>
            <LocalSkillMeta item={item} badges={badges} className="shrink-0 flex-nowrap" />
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {item.description ?? t("skills.noDescription")}
          </p>
        </div>
        <SkillTags tags={item.tags} max={2} className="hidden shrink lg:flex" />
        {footer ? (
          <div className={cn(SKILL_ITEM_RAISED_CLASS, "flex shrink-0 items-center gap-2")}>
            {footer}
          </div>
        ) : null}
        {actions ? (
          <div className={cn(SKILL_ITEM_RAISED_CLASS, "flex shrink-0 items-center gap-1")}>
            {actions}
          </div>
        ) : null}
      </div>
    </SkillContextMenu>
  );
}
