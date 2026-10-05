import type { UseQueryResult } from "@tanstack/react-query";
import { FolderSearch, Plus, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import type { LocalSkillView } from "./local-skill-view";
import { LocalSkillCollection, type LocalSkillCollectionProps } from "./LocalSkillCollection";
import { LocalSkillSkeletons } from "./LocalSkillSkeletons";
import type { LocalSkillFilters } from "./use-local-skill-filters";

export interface LocalSkillListProps<T extends LocalSkillView> extends Omit<
  LocalSkillCollectionProps<T>,
  "items"
> {
  /** The query that reads the skills. */
  status: Pick<UseQueryResult, "isPending" | "error" | "refetch">;
  /** Every skill here; `filters` holds the ones shown. */
  items: readonly T[];
  filters: LocalSkillFilters<T>;
  emptyTitle: string;
  emptyDescription: string;
  /** The empty state's button: the page's Add. */
  addLabel: string;
  onAdd: () => void;
  /** Runs after the filters' own reset when "Clear filters" is pressed. */
  onClearFilters?: () => void;
}

/** The skills in their loading, error, empty, no-match or shown state. */
export function LocalSkillList<T extends LocalSkillView>({
  status,
  items,
  filters,
  emptyTitle,
  emptyDescription,
  addLabel,
  onAdd,
  onClearFilters,
  ...collection
}: LocalSkillListProps<T>): ReactNode {
  const { t } = useTranslation();
  if (status.isPending) return <LocalSkillSkeletons viewMode={collection.viewMode} />;
  if (status.error) {
    return (
      <ErrorState error={status.error} onRetry={() => void status.refetch()} className="flex-1" />
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={FolderSearch}
        title={emptyTitle}
        description={emptyDescription}
        action={{ label: addLabel, icon: Plus, onClick: onAdd }}
        className="flex-1"
      />
    );
  }
  if (filters.filtered.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title={t("localSkills.noMatchTitle")}
        description={t("localSkills.noMatchDescription")}
        action={{
          label: t("localSkills.clearFilters"),
          onClick: () => {
            filters.reset();
            onClearFilters?.();
          },
        }}
        className="flex-1"
      />
    );
  }
  return <LocalSkillCollection {...collection} items={filters.filtered} />;
}
