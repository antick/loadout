import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SearchInput } from "@/components/SearchInput";
import { TagFilterBar } from "@/components/TagFilterBar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ViewModeToggle } from "@/components/ViewModeToggle";
import {
  type LibraryFilters,
  SORT_MODES,
  SOURCE_FILTERS,
  STATUS_FILTERS,
  type SortMode,
  type SourceFilter,
  type StatusFilter,
} from "@/features/library/library-filters";
import type { ViewMode } from "@/lib/constants";

export interface LibraryToolbarProps {
  filters: LibraryFilters;
  onChange: (patch: Partial<LibraryFilters>) => void;
  tags: readonly string[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

/** Search, source / status filters, sort, grid-list switch, and the tag filter row. */
export function LibraryToolbar({
  filters,
  onChange,
  tags,
  viewMode,
  onViewModeChange,
}: LibraryToolbarProps): ReactNode {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={filters.query}
          onChange={(query) => onChange({ query })}
          placeholder={t("library.toolbar.search")}
          className="w-72 max-w-full"
        />
        <Select
          value={filters.source}
          onValueChange={(value) => onChange({ source: value as SourceFilter })}
        >
          <SelectTrigger size="sm" className="w-40" aria-label={t("library.toolbar.source")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_FILTERS.map((source) => (
              <SelectItem key={source} value={source}>
                {t(`library.toolbar.sources.${source}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.status}
          onValueChange={(value) => onChange({ status: value as StatusFilter })}
        >
          <SelectTrigger size="sm" className="w-44" aria-label={t("library.toolbar.status")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((status) => (
              <SelectItem key={status} value={status}>
                {t(`library.toolbar.statuses.${status}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Select
            value={filters.sort}
            onValueChange={(value) => onChange({ sort: value as SortMode })}
          >
            <SelectTrigger size="sm" className="w-44" aria-label={t("library.toolbar.sort")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_MODES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {t(`library.toolbar.sorts.${mode}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ViewModeToggle value={viewMode} onChange={onViewModeChange} />
        </div>
      </div>
      <TagFilterBar
        tags={tags}
        value={filters.tags}
        onChange={(next) => onChange({ tags: next })}
        manageable
      />
    </div>
  );
}
