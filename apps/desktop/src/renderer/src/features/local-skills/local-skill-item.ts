import type { MouseEvent, ReactNode } from "react";
import type { LocalSkillView } from "./local-skill-view";

export interface LocalSkillItemProps {
  item: LocalSkillView;
  /** Open the detail sheet (ignored while selecting: a click toggles selection instead). */
  onOpen?: (item: LocalSkillView) => void;
  selecting?: boolean;
  selected?: boolean;
  /** Enables the checkbox. Shift-click anywhere on the item selects a range. */
  onSelectToggle?: (item: LocalSkillView, modifiers: { shiftKey: boolean }) => void;
  /** Highlight as the entry whose detail sheet is open. */
  current?: boolean;
  /** Extra chips after the sync status, e.g. "Managed". */
  badges?: ReactNode;
  /** Slot for menus, switches and buttons at the top right. */
  actions?: ReactNode;
  /** Slot under the content: agent dots, the primary sync action. */
  footer?: ReactNode;
  className?: string;
}

/** Click behaviour shared by the card and the row: open, or toggle while selecting. */
export function localSkillItemClick({
  item,
  onOpen,
  selecting,
  onSelectToggle,
}: LocalSkillItemProps): (event: MouseEvent) => void {
  return (event) => {
    const shiftKey = event.shiftKey && Boolean(onSelectToggle);
    if (selecting || shiftKey) onSelectToggle?.(item, { shiftKey });
    else onOpen?.(item);
  };
}
