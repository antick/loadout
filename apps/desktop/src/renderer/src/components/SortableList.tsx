import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";
import { DRAG_ACTIVATION_DISTANCE_PX } from "@/lib/constants";
import { cn } from "@/lib/utils";

export interface SortableListProps<T extends { id: string }> {
  items: readonly T[];
  /** Called with every id in the new order. */
  onReorder: (ids: string[]) => void;
  renderItem: (item: T, index: number) => ReactNode;
  /** Element used for each row; `li` when the list sits inside a `<ul>`. */
  itemAs?: "li" | "div";
  itemClassName?: string;
  disabled?: boolean;
}

function SortableItem({
  id,
  as: Comp,
  className,
  disabled,
  children,
}: {
  id: string;
  as: "li" | "div";
  className?: string;
  disabled?: boolean;
  children: ReactNode;
}): ReactNode {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  return (
    <Comp
      ref={setNodeRef as (node: HTMLElement | null) => void}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(className, isDragging && "relative z-10 opacity-80")}
      {...listeners}
    >
      {children}
    </Comp>
  );
}

/**
 * Vertical drag-to-reorder list. The whole row is the handle; a drag only starts after the pointer
 * has moved a little, so clicks and links inside rows keep working. Offer "Move up / down" menu
 * items next to it for keyboard users (`moveId` helps).
 */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
  itemAs = "div",
  itemClassName,
  disabled,
}: SortableListProps<T>): ReactNode {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE_PX } }),
  );
  const ids = items.map((item) => item.id);

  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from !== -1 && to !== -1) onReorder(arrayMove(ids, from, to));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {items.map((item, index) => (
          <SortableItem
            key={item.id}
            id={item.id}
            as={itemAs}
            className={itemClassName}
            disabled={disabled}
          >
            {renderItem(item, index)}
          </SortableItem>
        ))}
      </SortableContext>
    </DndContext>
  );
}
