import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { IconButton } from "@/components/IconButton";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Selection } from "@/hooks/use-selection";
import { cn } from "@/lib/utils";

export interface SelectionToolbarProps {
  selection: Selection;
  /** Action buttons for the selected items. */
  children?: ReactNode;
  className?: string;
}

/** Sticky bar shown while selecting: count, select all / none, the page's actions, and exit. */
export function SelectionToolbar({
  selection,
  children,
  className,
}: SelectionToolbarProps): ReactNode {
  const { t } = useTranslation();
  if (!selection.active) return null;
  return (
    <div
      role="toolbar"
      aria-label={t("selection.toolbar")}
      className={cn(
        "sticky top-0 z-20 flex h-11 items-center gap-2 rounded-lg border border-primary/30 bg-card/95 px-3 shadow-sm backdrop-blur animate-in fade-in slide-in-from-top-1 duration-150 motion-reduce:animate-none",
        className,
      )}
    >
      <span className="text-sm font-medium tabular-nums" aria-live="polite">
        {t("selection.count", { count: selection.count })}
      </span>
      <Button
        variant="ghost"
        size="xs"
        onClick={selection.allSelected ? selection.clear : selection.selectAll}
      >
        {selection.allSelected ? t("selection.selectNone") : t("selection.selectAll")}
      </Button>
      <Separator orientation="vertical" className="mx-1 h-5!" />
      <div className="flex min-w-0 flex-1 items-center gap-1.5">{children}</div>
      <IconButton label={t("selection.exit")} icon={<X />} onClick={selection.exit} />
    </div>
  );
}
