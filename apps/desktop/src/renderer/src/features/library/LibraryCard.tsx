import type { AgentInfo, Skill, SkillUsage } from "@loadout/shared";
import { type ReactNode, memo, useMemo } from "react";
import { FavoriteButton } from "@/components/FavoriteButton";
import type { SkillAction } from "@/components/skill-action";
import { SkillIndicators } from "@/components/SkillIndicators";
import { SkillItem } from "@/components/SkillItem";
import { SkillTags } from "@/components/SkillTags";
import { SourceBadge } from "@/components/SourceBadge";
import { SkillAgentBadges } from "@/features/library/SkillAgentBadges";
import type { AgentToggle } from "@/hooks/mutations/deploy";
import { SkillUsageNote } from "@/features/library/SkillUsageNote";
import { SKILL_ROW_MAX_TAGS } from "@/lib/constants";

export interface LibraryCardProps {
  skill: Skill;
  layout: "grid" | "list";
  current: boolean;
  selecting: boolean;
  selected: boolean;
  /** Its usage, shown when `showUsage`. */
  usage: SkillUsage | undefined;
  showUsage: boolean;
  agents: readonly AgentInfo[];
  onToggleAgent: AgentToggle;
  onSelectToggle(skill: Skill, modifiers: { shiftKey: boolean }): void;
  onOpen(skill: Skill): void;
  actionsFor(skill: Skill): SkillAction[];
}

/**
 * A library skill as the Library page lists it. Drawn again only when its own props change: the
 * page hands every card the same callbacks, so typing in the search or one deploy does not redraw
 * hundreds of cards.
 */
export const LibraryCard = memo(function LibraryCard({
  skill,
  layout,
  current,
  selecting,
  selected,
  usage,
  showUsage,
  agents,
  onToggleAgent,
  onSelectToggle,
  onOpen,
  actionsFor,
}: LibraryCardProps): ReactNode {
  const menuActions = useMemo(() => actionsFor(skill), [actionsFor, skill]);
  const indicators = <SkillIndicators skill={skill} compact />;
  const favorite = <FavoriteButton skill={skill} />;
  // A card puts the indicators by the star and the source before the tags; a row puts them
  // after the name and keeps the tags first, shown only on wide windows.
  const grid = layout === "grid";
  return (
    <SkillItem
      item={skill}
      layout={layout}
      current={current}
      selecting={selecting}
      selected={selected}
      onSelectToggle={onSelectToggle}
      onOpen={onOpen}
      titleAside={grid ? undefined : indicators}
      actions={
        grid ? (
          <>
            {indicators}
            {favorite}
          </>
        ) : (
          favorite
        )
      }
      meta={
        grid ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <SourceBadge skill={skill} />
            <SkillTags tags={skill.tags} />
          </div>
        ) : (
          <div className="hidden min-w-0 shrink items-center gap-1.5 lg:flex">
            <SkillTags tags={skill.tags} max={SKILL_ROW_MAX_TAGS} />
            <SourceBadge skill={skill} compact />
          </div>
        )
      }
      footer={
        <div className="flex min-w-0 items-center gap-3">
          <SkillAgentBadges skill={skill} agents={agents} onToggle={onToggleAgent} />
          {showUsage ? <SkillUsageNote usage={usage} /> : null}
        </div>
      }
      menuActions={menuActions}
    />
  );
});
