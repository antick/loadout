import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { SearchInput } from "@/components/SearchInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REVIEW_FILTERS, type ReviewFilter } from "./review-filter";

export interface SyncReviewFiltersProps {
  query: string;
  onQuery(query: string): void;
  filter: ReviewFilter;
  onFilter(filter: ReviewFilter): void;
  /** Skills each filter would show. Kinds with none are left out of the menu. */
  counts: Record<ReviewFilter, number>;
}

/** Search and a kind-of-change menu above a long sync review. */
export function SyncReviewFilters({
  query,
  onQuery,
  filter,
  onFilter,
  counts,
}: SyncReviewFiltersProps): ReactNode {
  const { t } = useTranslation();
  const label = (entry: ReviewFilter): string => {
    if (entry === "all") return t("backupSync.review.filter.all");
    if (entry === "conflict") return t("backupSync.review.conflicts");
    return t(`backupSync.review.change.${entry}`);
  };
  const offered = REVIEW_FILTERS.filter(
    (entry) => entry === "all" || entry === filter || counts[entry] > 0,
  );

  return (
    <div className="flex items-center gap-2">
      <SearchInput
        value={query}
        onChange={onQuery}
        placeholder={t("backupSync.review.search")}
        focusHotkey={false}
        className="w-auto flex-1"
      />
      <Select
        value={filter}
        onValueChange={(next) => {
          const picked = REVIEW_FILTERS.find((entry) => entry === next);
          if (picked) onFilter(picked);
        }}
      >
        <SelectTrigger size="sm" className="w-52" aria-label={t("backupSync.review.filter.label")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {offered.map((entry) => (
            <SelectItem key={entry} value={entry}>
              {label(entry)}
              <span className="text-muted-foreground tabular-nums">{counts[entry]}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
