import type { LucideIcon } from "lucide-react";

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
