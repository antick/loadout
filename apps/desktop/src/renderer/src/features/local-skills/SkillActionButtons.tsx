import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { SkillAction } from "@/components/skill-action";

/** Actions as buttons: only the primary ones on a card, all of them in the detail sheet. */
export function SkillActionButtons({
  actions,
  all,
  size = "xs",
}: {
  actions: readonly SkillAction[];
  /** Include the non-primary actions too. */
  all?: boolean;
  size?: "xs" | "sm";
}): ReactNode {
  const shown = all ? actions : actions.filter((action) => action.primary);
  return shown.map((action) => {
    const Icon = action.icon;
    return (
      <Button
        key={action.id}
        type="button"
        size={size}
        variant={action.destructive ? "ghost" : "outline"}
        className={
          action.destructive ? "text-danger hover:bg-danger/10 hover:text-danger" : undefined
        }
        onClick={action.run}
      >
        <Icon />
        {action.label}
      </Button>
    );
  });
}
