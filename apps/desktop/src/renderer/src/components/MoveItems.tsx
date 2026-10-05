import { ChevronDown, ChevronUp } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "@/components/IconButton";

/** One entry's place in an ordered list, and how to move it one step. */
export interface MoveItemsProps {
  index: number;
  total: number;
  onMove: (step: -1 | 1) => void;
}

interface MenuItemProps {
  disabled?: boolean;
  onSelect?: () => void;
  children?: ReactNode;
}

/** Move up and Move down as two items of a context or dropdown menu (`Item`). */
export function MoveMenuItems({
  index,
  total,
  onMove,
  Item,
}: MoveItemsProps & { Item: ComponentType<MenuItemProps> }): ReactNode {
  const { t } = useTranslation();
  return (
    <>
      <Item disabled={index === 0} onSelect={() => onMove(-1)}>
        {t("common.moveUp")}
      </Item>
      <Item disabled={index === total - 1} onSelect={() => onMove(1)}>
        {t("common.moveDown")}
      </Item>
    </>
  );
}

/** Move up and Move down as two small icon buttons. */
export function MoveButtons({ index, total, onMove }: MoveItemsProps): ReactNode {
  const { t } = useTranslation();
  return (
    <>
      <IconButton
        size="icon-xs"
        label={t("common.moveUp")}
        icon={<ChevronUp />}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      />
      <IconButton
        size="icon-xs"
        label={t("common.moveDown")}
        icon={<ChevronDown />}
        disabled={index === total - 1}
        onClick={() => onMove(1)}
      />
    </>
  );
}
