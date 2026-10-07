import type { ReactNode } from "react";
import { type SkillAction, splitActions } from "@/components/skill-action";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

function menuEntry(action: SkillAction): ReactNode {
  const Icon = action.icon;
  return (
    <ContextMenuItem
      key={action.id}
      variant={action.destructive ? "destructive" : "default"}
      onSelect={action.run}
    >
      <Icon />
      {action.label}
    </ContextMenuItem>
  );
}

export interface SkillContextMenuProps {
  /** Nothing is shown (the browser's own menu stays off) when empty or undefined. */
  actions: readonly SkillAction[] | undefined;
  /** While selecting, a right-click does nothing special. */
  disabled?: boolean;
  /** The skill item; must accept a ref and pointer handlers. */
  children: ReactNode;
}

/** Right-click menu of a skill item, with the same actions as its "…" menu. */
export function SkillContextMenu({
  actions,
  disabled,
  children,
}: SkillContextMenuProps): ReactNode {
  const { safe, destructive } = splitActions(actions ?? []);
  // Always the same tree, only switched off: swapping it for the bare item would remount every
  // item (and lose keyboard focus) the moment selection starts.
  const off = disabled === true || safe.length + destructive.length === 0;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={off}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        {safe.map(menuEntry)}
        {safe.length > 0 && destructive.length > 0 ? <ContextMenuSeparator /> : null}
        {destructive.map(menuEntry)}
      </ContextMenuContent>
    </ContextMenu>
  );
}
