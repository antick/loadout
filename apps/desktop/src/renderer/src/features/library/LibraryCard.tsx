import type { AgentInfo, Skill, SkillUsage } from "@loadout/shared";
import { type ReactNode, memo, useMemo } from "react";
import { FavoriteButton } from "@/components/FavoriteButton";
import type { SkillAction } from "@/components/skill-action";
import { LibrarySkillItem } from "@/features/library/LibrarySkillItem";
import { type AgentToggle, SkillAgentBadges } from "@/features/library/SkillAgentBadges";
import { SkillUsageNote } from "@/features/library/SkillUsageNote";

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
  return (
    <LibrarySkillItem
      skill={skill}
      layout={layout}
      current={current}
      selecting={selecting}
      selected={selected}
      onSelectToggle={onSelectToggle}
      onOpen={onOpen}
      footer={
        <div className="flex min-w-0 items-center gap-3">
          <SkillAgentBadges skill={skill} agents={agents} onToggle={onToggleAgent} />
          {showUsage ? <SkillUsageNote usage={usage} /> : null}
        </div>
      }
      menuActions={menuActions}
      actions={<FavoriteButton skill={skill} />}
    />
  );
});
