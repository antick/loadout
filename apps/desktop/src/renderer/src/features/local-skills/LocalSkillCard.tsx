import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
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

/** Grid variant of a skill found on disk (agent folder or project). */
export function LocalSkillCard(props: LocalSkillItemProps): ReactNode {
  const { item, selected, current, badges, actions, footer } = props;
  const { t } = useTranslation();
  const nested = item.relativePath !== item.name;

  return (
    <div
      data-selected={selected ?? false}
      data-current={current ?? false}
      className={cn(
        SKILL_ITEM_BASE_CLASS,
        "flex min-h-40 flex-col gap-2 rounded-lg p-3",
        item.enabledState === "none" && "bg-muted/30",
        props.className,
      )}
    >
      <button
        type="button"
        aria-label={item.name}
        className={SKILL_ITEM_HIT_CLASS}
        onClick={localSkillItemClick(props)}
      />
      <div className="flex items-start gap-2">
        <LocalSkillSelectBox
          item={item}
          selecting={props.selecting}
          selected={selected}
          onSelectToggle={props.onSelectToggle}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <h3
            className={cn(
              "truncate text-sm font-medium",
              item.enabledState === "none" && "text-muted-foreground",
            )}
            title={item.name}
          >
            {item.name}
          </h3>
          {nested ? (
            <p
              className="truncate font-mono text-xs text-muted-foreground"
              title={item.relativePath}
            >
              {item.relativePath}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className={cn(SKILL_ITEM_RAISED_CLASS, "flex shrink-0 items-center gap-1")}>
            {actions}
          </div>
        ) : null}
      </div>
      <p className="line-clamp-2 min-h-8 text-xs leading-4 text-muted-foreground">
        {item.description ?? t("skills.noDescription")}
      </p>
      <LocalSkillMeta item={item} badges={badges} />
      <SkillTags tags={item.tags} />
      {footer ? (
        <div
          className={cn(
            SKILL_ITEM_RAISED_CLASS,
            "mt-auto flex w-full flex-wrap items-center gap-2 pt-1",
          )}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}
