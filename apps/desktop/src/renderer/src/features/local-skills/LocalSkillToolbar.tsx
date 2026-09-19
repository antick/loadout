import type { ReactNode } from "react";
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
  /** Quiet text on the right, e.g. "12 of 40". */
  summary?: ReactNode;
}

/** Search, the page's own filters, grid/list switch, and the tag pills underneath. */
export function LocalSkillToolbar<T extends LocalSkillView>({
  filters,
  viewMode,
  onViewModeChange,
  searchPlaceholder,
  children,
  summary,
}: LocalSkillToolbarProps<T>): ReactNode {
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
          {summary ? (
            <span className="text-xs text-muted-foreground tabular-nums">{summary}</span>
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
