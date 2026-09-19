import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SKILL_ITEM_RAISED_CLASS } from "@/components/skill-item";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { LocalSkillItemProps } from "./local-skill-item";

/** Selection checkbox of a card or row: faint until hovered, solid while selecting. */
export function LocalSkillSelectBox({
  item,
  selecting,
  selected,
  onSelectToggle,
  className,
}: Pick<
  LocalSkillItemProps,
  "item" | "selecting" | "selected" | "onSelectToggle" | "className"
>): ReactNode {
  const { t } = useTranslation();
  if (!onSelectToggle) return null;
  return (
    <Checkbox
      checked={selected ?? false}
      aria-label={t("selection.selectItem", { name: item.name })}
      onClick={(event) => onSelectToggle(item, { shiftKey: event.shiftKey })}
      className={cn(
        SKILL_ITEM_RAISED_CLASS,
        "transition-opacity",
        !selecting &&
          "opacity-40 group-focus-within/skill:opacity-100 group-hover/skill:opacity-100",
        className,
      )}
    />
  );
}
