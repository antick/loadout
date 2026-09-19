import { LayoutGrid, List } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { VIEW_MODES, type ViewMode } from "@/lib/constants";

const ICONS = { grid: LayoutGrid, list: List } as const;

/** Grid / list switch. Pair with `useViewMode(scope)` to remember the choice per page. */
export function ViewModeToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}): ReactNode {
  const { t } = useTranslation();
  return (
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      value={value}
      aria-label={t("viewMode.label")}
      onValueChange={(next) => {
        const mode = VIEW_MODES.find((candidate) => candidate === next);
        if (mode) onChange(mode);
      }}
    >
      {VIEW_MODES.map((mode) => {
        const Icon = ICONS[mode];
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
