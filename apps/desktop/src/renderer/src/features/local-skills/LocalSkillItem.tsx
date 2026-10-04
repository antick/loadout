import type { ReactNode } from "react";
import { SkillItem, type SkillItemProps } from "@/components/SkillItem";
import { SkillTags } from "@/components/SkillTags";
import { SKILL_ROW_MAX_TAGS } from "@/lib/constants";
import type { LocalSkillView } from "./local-skill-view";
import { LocalSkillMeta } from "./LocalSkillMeta";

export interface LocalSkillItemProps<T extends LocalSkillView> extends Omit<
  SkillItemProps<T>,
  "muted" | "tall" | "path" | "titleAside" | "meta"
> {
  /** Extra chips after the sync status, e.g. "Managed". */
  badges?: ReactNode;
}

/** A skill found on disk (agent folder or project) as a card or a row, with its sync status. */
export function LocalSkillItem<T extends LocalSkillView>({
  badges,
  ...props
}: LocalSkillItemProps<T>): ReactNode {
  const { item, layout } = props;
  const muted = item.enabledState === "none";
  const path = item.relativePath !== item.name ? item.relativePath : undefined;
  if (layout === "grid") {
    return (
      <SkillItem
        {...props}
        muted={muted}
        tall
        path={path}
        meta={
          <>
            <LocalSkillMeta item={item} badges={badges} />
            <SkillTags tags={item.tags} />
          </>
        }
      />
    );
  }
  return (
    <SkillItem
      {...props}
      muted={muted}
      path={path}
      titleAside={<LocalSkillMeta item={item} badges={badges} className="shrink-0 flex-nowrap" />}
      meta={
        <SkillTags tags={item.tags} max={SKILL_ROW_MAX_TAGS} className="hidden shrink lg:flex" />
      }
    />
  );
}
