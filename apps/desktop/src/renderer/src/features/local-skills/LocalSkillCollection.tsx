import type { ReactNode } from "react";
import type { Selection } from "@/hooks/use-selection";
import type { ViewMode } from "@/lib/constants";
import type { LocalSkillView } from "./local-skill-view";
import { LocalSkillCard } from "./LocalSkillCard";
import { LocalSkillRow } from "./LocalSkillRow";

export const LOCAL_SKILL_GRID_CLASS = "grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-3";
export const LOCAL_SKILL_LIST_CLASS = "flex flex-col gap-1.5";

export interface LocalSkillCollectionProps<T extends LocalSkillView> {
  items: readonly T[];
  viewMode: ViewMode;
  selection: Selection;
  /** Id of the entry whose detail sheet is open. */
  currentId?: string | null;
  onOpen: (item: T) => void;
  renderBadges?: (item: T) => ReactNode;
  renderActions?: (item: T) => ReactNode;
  renderFooter?: (item: T) => ReactNode;
}

/** The filtered skills as a grid of cards or a list of rows, wired to one selection. */
export function LocalSkillCollection<T extends LocalSkillView>({
  items,
  viewMode,
  selection,
  currentId,
  onOpen,
  renderBadges,
  renderActions,
  renderFooter,
}: LocalSkillCollectionProps<T>): ReactNode {
  const Item = viewMode === "grid" ? LocalSkillCard : LocalSkillRow;
  return (
    <div className={viewMode === "grid" ? LOCAL_SKILL_GRID_CLASS : LOCAL_SKILL_LIST_CLASS}>
      {items.map((item) => (
        <Item
          key={item.id}
          item={item}
          current={currentId === item.id}
          selecting={selection.active}
          selected={selection.isSelected(item.id)}
          onSelectToggle={(_entry, modifiers) => selection.toggle(item.id, modifiers)}
          onOpen={() => onOpen(item)}
          badges={renderBadges?.(item)}
          // While selecting, a click anywhere picks the item, so per-item controls step aside.
          actions={selection.active ? null : renderActions?.(item)}
          footer={renderFooter?.(item)}
        />
      ))}
    </div>
  );
}
