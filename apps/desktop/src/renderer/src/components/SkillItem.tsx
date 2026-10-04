import type { MouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { SkillAction } from "@/components/skill-action";
import {
  SKILL_ITEM_BASE_CLASS,
  SKILL_ITEM_HIT_CLASS,
  SKILL_ITEM_RAISED_CLASS,
} from "@/components/skill-item";
import { SkillContextMenu } from "@/components/SkillContextMenu";
import { Checkbox } from "@/components/ui/checkbox";
import type { ViewMode } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** What every skill item shows: a library skill, or a skill found on disk. */
export interface SkillItemEntry {
  name: string;
  description: string | null;
}

export interface SkillItemProps<T extends SkillItemEntry> {
  item: T;
  /** A card in a grid, or a row in a list. */
  layout: ViewMode;
  /** Open the item (ignored while selecting: a click toggles selection instead). */
  onOpen?: (item: T) => void;
  /** Selection mode is on: keep the checkbox visible and make clicks toggle. */
  selecting?: boolean;
  selected?: boolean;
  /** Enables the checkbox. Shift-click anywhere on the item selects a range. */
  onSelectToggle?: (item: T, modifiers: { shiftKey: boolean }) => void;
  /** Highlight as the item that is open. */
  current?: boolean;
  /** Right-click menu of the item, usually the same actions as its "…" menu. */
  menuActions?: readonly SkillAction[];
  /** Switched off: a quieter box and name. */
  muted?: boolean;
  /** Grid only: a taller card, for items with a status line under the description. */
  tall?: boolean;
  /** The folder, when it is not just the name: under the name in a card, the name's tooltip in a row. */
  path?: string;
  /** Row only: chips on the name's line. */
  titleAside?: ReactNode;
  /** Slot for menus, switches and buttons: top right of a card, far right of a row. */
  actions?: ReactNode;
  /** Card: lines under the description. Row: shown from the `lg` width on, before the footer. */
  meta?: ReactNode;
  /** Card: the bottom line. Row: before the actions. */
  footer?: ReactNode;
}

const LAYOUT_CLASS: Record<ViewMode, string> = {
  grid: "flex flex-col gap-2 rounded-lg p-3",
  list: "flex items-center gap-3 rounded-lg px-3 py-2",
};

// Clicks on the empty part of a card's bottom line reach the stretched button underneath.
const FOOTER_CLASS: Record<ViewMode, string> = {
  grid: "pointer-events-none mt-auto flex w-full flex-wrap items-center gap-2 pt-1 *:pointer-events-auto",
  list: "flex shrink-0 items-center gap-2",
};

/**
 * One skill as a card or a row: a stretched button opens it (or toggles it while selecting), and
 * the checkbox, the slots and the context menu sit above that button.
 */
export function SkillItem<T extends SkillItemEntry>(props: SkillItemProps<T>): ReactNode {
  const { item, layout, selecting, selected, onSelectToggle, actions, meta, footer } = props;
  const { t } = useTranslation();
  const grid = layout === "grid";

  const onClick = (event: MouseEvent): void => {
    const shiftKey = event.shiftKey && Boolean(onSelectToggle);
    if (selecting || shiftKey) onSelectToggle?.(item, { shiftKey });
    else props.onOpen?.(item);
  };

  const checkbox = onSelectToggle ? (
    <Checkbox
      checked={selected ?? false}
      aria-label={t("selection.selectItem", { name: item.name })}
      onClick={(event) => onSelectToggle(item, { shiftKey: event.shiftKey })}
      className={cn(
        SKILL_ITEM_RAISED_CLASS,
        "transition-opacity",
        grid && "mt-0.5",
        !selecting &&
          "opacity-40 group-focus-within/skill:opacity-100 group-hover/skill:opacity-100",
      )}
    />
  ) : null;
  // In a card without a path the name sits straight in the top line, next to the slots.
  const title = (
    <h3
      className={cn(
        "truncate text-sm font-medium",
        grid && !props.path && "min-w-0 flex-1",
        props.muted && "text-muted-foreground",
      )}
      title={grid ? item.name : (props.path ?? item.name)}
    >
      {item.name}
    </h3>
  );
  const description = item.description ?? t("skills.noDescription");
  const actionsSlot = actions ? (
    <div className={cn(SKILL_ITEM_RAISED_CLASS, "flex shrink-0 items-center gap-1")}>{actions}</div>
  ) : null;
  const footerSlot = footer ? (
    <div className={cn(SKILL_ITEM_RAISED_CLASS, FOOTER_CLASS[layout])}>{footer}</div>
  ) : null;

  return (
    <SkillContextMenu actions={props.menuActions} disabled={selecting}>
      <div
        data-selected={selected ?? false}
        data-current={props.current ?? false}
        className={cn(
          SKILL_ITEM_BASE_CLASS,
          LAYOUT_CLASS[layout],
          grid && (props.tall ? "min-h-40" : "min-h-36"),
          props.muted && "bg-muted/30",
        )}
      >
        <button
          type="button"
          aria-label={item.name}
          className={SKILL_ITEM_HIT_CLASS}
          onClick={onClick}
        />
        {grid ? (
          <>
            <div className="flex items-start gap-2">
              {checkbox}
              {props.path ? (
                <div className="min-w-0 flex-1">
                  {title}
                  <p
                    className="truncate font-mono text-xs text-muted-foreground"
                    title={props.path}
                  >
                    {props.path}
                  </p>
                </div>
              ) : (
                title
              )}
              {actionsSlot}
            </div>
            <p className="line-clamp-2 min-h-8 text-xs leading-4 text-muted-foreground">
              {description}
            </p>
            {meta}
            {footerSlot}
          </>
        ) : (
          <>
            {checkbox}
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                {title}
                {props.titleAside}
              </div>
              <p className="truncate text-xs text-muted-foreground">{description}</p>
            </div>
            {meta}
            {footerSlot}
            {actionsSlot}
          </>
        )}
      </div>
    </SkillContextMenu>
  );
}
