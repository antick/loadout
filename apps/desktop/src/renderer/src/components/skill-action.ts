import type { LucideIcon } from "lucide-react";
import type { MouseEvent } from "react";

/** One thing the user can do with a skill. Pages build the list; shared parts draw it. */
export interface SkillAction {
  id: string;
  label: string;
  icon: LucideIcon;
  run: () => void;
  /** Deletes something: drawn in the danger colour and listed last. */
  destructive?: boolean;
  /** Worth a button of its own on the card, not only a menu entry. */
  primary?: boolean;
}

/** The action that opens a skill in the editor; double-clicking a skill runs it. */
export const EDIT_ACTION_ID = "edit";

/** Menu order: everything safe first, destructive actions under a divider. */
export function splitActions(actions: readonly SkillAction[]): {
  safe: SkillAction[];
  destructive: SkillAction[];
} {
  return {
    safe: actions.filter((action) => !action.destructive),
    destructive: actions.filter((action) => action.destructive),
  };
}

/**
 * Double-click on a skill item: open it in the editor. Ignored while selecting and with Shift
 * held, where clicks pick items instead.
 */
export function editOnDoubleClick(
  actions: readonly SkillAction[] | undefined,
  selecting: boolean | undefined,
): ((event: MouseEvent) => void) | undefined {
  const edit = actions?.find((action) => action.id === EDIT_ACTION_ID);
  if (!edit || selecting) return undefined;
  return (event) => {
    if (!event.shiftKey) edit.run();
  };
}
