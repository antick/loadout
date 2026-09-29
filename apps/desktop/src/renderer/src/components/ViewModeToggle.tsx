import { LayoutGrid, List, type LucideIcon, Table2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type LibraryViewMode, VIEW_MODES, type ViewMode } from "@/lib/constants";

const ICONS: Record<LibraryViewMode, LucideIcon> = {
  grid: LayoutGrid,
  list: List,
  matrix: Table2,
};

export interface ViewModeToggleProps<T extends LibraryViewMode = ViewMode> {
  value: T;
  onChange: (mode: T) => void;
  /** The views this page offers; grid and list unless it says otherwise. */
  modes?: readonly T[];
}

/** Grid / list switch. Pair with `useViewMode(scope)` to remember the choice per page. */
export function ViewModeToggle<T extends LibraryViewMode = ViewMode>({
  value,
  onChange,
  modes = VIEW_MODES as readonly LibraryViewMode[] as readonly T[],
}: ViewModeToggleProps<T>): ReactNode {
  const { t } = useTranslation();
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      value={value}
      aria-label={t("viewMode.label")}
      onValueChange={(next) => {
        const mode = modes.find((candidate) => candidate === next);
        if (mode) onChange(mode);
      }}
    >
      {modes.map((mode) => {
        const Icon: LucideIcon = ICONS[mode];
        return (
          <ToggleGroupItem
            key={mode}
            value={mode}
            aria-label={t(`viewMode.${mode}`)}
            title={t(`viewMode.${mode}`)}
          >
            <Icon />
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
