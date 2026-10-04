import type { Skill } from "@loadout/shared";
import type { ReactNode } from "react";
import { SkillIndicators } from "@/components/SkillIndicators";
import { SkillItem, type SkillItemProps } from "@/components/SkillItem";
import { SkillTags } from "@/components/SkillTags";
import { SourceBadge } from "@/components/SourceBadge";
import { SKILL_ROW_MAX_TAGS } from "@/lib/constants";

export interface LibrarySkillItemProps extends Omit<
  SkillItemProps<Skill>,
  "item" | "muted" | "tall" | "path" | "titleAside" | "meta"
> {
  skill: Skill;
}

/** A library skill as a card or a row: its indicators, source and tags around the caller's slots. */
export function LibrarySkillItem({
  skill,
  layout,
  actions,
  ...rest
}: LibrarySkillItemProps): ReactNode {
  const indicators = <SkillIndicators skill={skill} compact />;
  if (layout === "grid") {
    return (
      <SkillItem
        {...rest}
        item={skill}
        layout={layout}
        actions={
          <>
            {indicators}
            {actions}
          </>
        }
        meta={
          <div className="flex min-w-0 items-center gap-1.5">
            <SourceBadge skill={skill} />
            <SkillTags tags={skill.tags} />
          </div>
        }
      />
    );
  }
  return (
    <SkillItem
      {...rest}
      item={skill}
      layout={layout}
      titleAside={indicators}
      actions={actions}
      meta={
        <div className="hidden min-w-0 shrink items-center gap-1.5 lg:flex">
          <SkillTags tags={skill.tags} max={SKILL_ROW_MAX_TAGS} />
          <SourceBadge skill={skill} compact />
        </div>
      }
    />
  );
}
