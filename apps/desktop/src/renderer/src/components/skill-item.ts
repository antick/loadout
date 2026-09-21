import type { Skill } from "@loadout/shared";
import type { MouseEvent, ReactNode } from "react";

export interface SkillItemProps {
  skill: Skill;
  /** Open the skill (ignored while selecting: a click toggles selection instead). */
  onOpen?: (skill: Skill) => void;
  /** Selection mode is on: keep the checkbox visible and make clicks toggle. */
  selecting?: boolean;
  selected?: boolean;
  /** Enables the checkbox. Shift-click anywhere on the item selects a range. */
  onSelectToggle?: (skill: Skill, modifiers: { shiftKey: boolean }) => void;
  /** Highlight as the currently opened skill. */
  current?: boolean;
  /** Slot for menus and buttons. */
  actions?: ReactNode;
  /** Slot for the agent badges, usually `<SkillAgentBadges />`. */
  footer?: ReactNode;
  className?: string;
}

/** Click behaviour shared by `SkillCard` and `SkillRow`: open, or toggle while selecting. */
export function skillItemClick({
  skill,
  onOpen,
  selecting,
  onSelectToggle,
}: SkillItemProps): (event: MouseEvent) => void {
  return (event) => {
    const shiftKey = event.shiftKey && Boolean(onSelectToggle);
    if (selecting || shiftKey) onSelectToggle?.(skill, { shiftKey });
    else onOpen?.(skill);
  };
}

/** Outer box of a skill item. The item itself is not interactive; `SKILL_ITEM_HIT_CLASS` is. */
export const SKILL_ITEM_BASE_CLASS =
  "group/skill relative border bg-card text-left transition-colors duration-150 hover:border-primary/40 hover:bg-accent/40 data-[current=true]:border-primary/50 data-[selected=true]:border-primary/60 data-[selected=true]:bg-primary/5";

/** A real button stretched over the item, so nested buttons stay valid and keyboard use is native. */
export const SKILL_ITEM_HIT_CLASS =
  "absolute inset-0 cursor-pointer rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/** Put on anything inside the item that must stay clickable above the stretched button. */
export const SKILL_ITEM_RAISED_CLASS = "relative z-10";
