import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SearchInput } from "@/components/SearchInput";
import { TagFilterBar } from "@/components/TagFilterBar";
import { ViewModeToggle } from "@/components/ViewModeToggle";
import type { ViewMode } from "@/lib/constants";
import type { LocalSkillView } from "./local-skill-view";
import type { LocalSkillFilters } from "./use-local-skill-filters";

export interface LocalSkillToolbarProps<T extends LocalSkillView> {
  filters: LocalSkillFilters<T>;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  searchPlaceholder?: string;
  /** The page's own filters, placed after the search field. */
  children?: ReactNode;
  /** How many skills there are before filtering, for the "12 of 40" on the right. */
  total: number;
}

/** Search, the page's own filters, grid/list switch, and the tag pills underneath. */
export function LocalSkillToolbar<T extends LocalSkillView>({
  filters,
  viewMode,
  onViewModeChange,
  searchPlaceholder,
  children,
  total,
}: LocalSkillToolbarProps<T>): ReactNode {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={filters.query}
          onChange={filters.setQuery}
          placeholder={searchPlaceholder}
        />
        {children}
        <div className="ml-auto flex items-center gap-3">
          {filters.isFiltering ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {t("localSkills.shownOf", { shown: filters.filtered.length, total })}
            </span>
          ) : null}
          <ViewModeToggle value={viewMode} onChange={onViewModeChange} />
        </div>
      </div>
      <TagFilterBar
        tags={filters.availableTags}
        value={filters.tagFilter}
        onChange={filters.setTagFilter}
        hideUntagged={!filters.hasUntagged}
      />
    </div>
  );
}
