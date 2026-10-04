import type { InstructionFile } from "@loadout/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { FolderSearch, ListChecks, Plus, RotateCw, SearchX } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { IconButton } from "@/components/IconButton";
import { type PageCrumb, PageHeader } from "@/components/layout/PageHeader";
import { SelectionToolbar } from "@/components/SelectionToolbar";
import { Button } from "@/components/ui/button";
import { InstructionFilesSection } from "@/features/instructions/InstructionFilesSection";
import type { Selection } from "@/hooks/use-selection";
import { useViewMode } from "@/hooks/use-view-mode";
import type { LocalSkillView } from "./local-skill-view";
import { LocalSkillCollection, type LocalSkillCollectionProps } from "./LocalSkillCollection";
import { LocalSkillSkeletons } from "./LocalSkillSkeletons";
import { LocalSkillToolbar } from "./LocalSkillToolbar";
import type { LocalSkillFilters } from "./use-local-skill-filters";

/** The page's own words for the parts every workspace has. */
export interface LocalSkillWorkspaceLabels {
  refresh: string;
  select: string;
  add: string;
  search: string;
  emptyTitle: string;
  emptyDescription: string;
}

export interface LocalSkillWorkspaceProps<T extends LocalSkillView> {
  title: string;
  subtitle?: string;
  breadcrumbs?: readonly PageCrumb[];
  /** Remembers the grid or list choice per kind of page. */
  viewModeScope: string;
  labels: LocalSkillWorkspaceLabels;
  onRefresh: () => Promise<void>;
  refreshDisabled?: boolean;
  onAdd: () => void;
  addDisabled?: boolean;
  /** Top-bar controls between Refresh and Select. */
  menu?: ReactNode;
  /** Top-bar buttons between Select and Add. */
  extraActions?: ReactNode;
  /** Right under the top bar: what this folder is. */
  header?: ReactNode;
  /** Shown instead of everything about the skills, e.g. when the folder is gone. */
  replacement?: ReactNode;
  instructionFiles: readonly InstructionFile[] | undefined;
  showReaders: boolean;
  /** Between the instruction files and the presets. */
  sections?: ReactNode;
  presetBar: ReactNode;
  /** Between the presets and the toolbar. */
  notices?: ReactNode;
  /** Every skill here; `filters` holds the ones shown. */
  items: readonly T[];
  filters: LocalSkillFilters<T>;
  /** More filters in the toolbar. */
  toolbarFilters?: ReactNode;
  /** Runs after the toolbar's own reset when "Clear filters" is pressed. */
  onClearFilters?: () => void;
  selection: Selection;
  /** The selection toolbar's actions. */
  selectionActions: ReactNode;
  /** The query that reads the skills. */
  status: Pick<UseQueryResult, "isPending" | "error" | "refetch">;
  collection: Omit<LocalSkillCollectionProps<T>, "items" | "viewMode" | "selection">;
  /** Under the skills. */
  after?: ReactNode;
  /** Sheets and dialogs. */
  children?: ReactNode;
}

/**
 * The page around skills found on disk (an agent's folder or a project): top bar with Refresh,
 * Select and Add, instruction files, presets, toolbar, selection, and the skills in their
 * loading, error, empty, no-match or shown state.
 */
export function LocalSkillWorkspace<T extends LocalSkillView>(
  props: LocalSkillWorkspaceProps<T>,
): ReactNode {
  const { labels, items, filters, selection, status } = props;
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useViewMode(props.viewModeScope);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    await props.onRefresh();
    setRefreshing(false);
  };

  let skills: ReactNode;
  if (status.isPending) {
    skills = <LocalSkillSkeletons viewMode={viewMode} />;
  } else if (status.error) {
    skills = (
      <ErrorState error={status.error} onRetry={() => void status.refetch()} className="flex-1" />
    );
  } else if (items.length === 0) {
    skills = (
      <EmptyState
        icon={FolderSearch}
        title={labels.emptyTitle}
        description={labels.emptyDescription}
        action={{ label: labels.add, icon: Plus, onClick: props.onAdd }}
        className="flex-1"
      />
    );
  } else if (filters.filtered.length === 0) {
    skills = (
      <EmptyState
        icon={SearchX}
        title={t("localSkills.noMatchTitle")}
        description={t("localSkills.noMatchDescription")}
        action={{
          label: t("localSkills.clearFilters"),
          onClick: () => {
            filters.reset();
            props.onClearFilters?.();
          },
        }}
        className="flex-1"
      />
    );
  } else {
    skills = (
      <LocalSkillCollection
        {...props.collection}
        items={filters.filtered}
        viewMode={viewMode}
        selection={selection}
      />
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-4 px-6 py-5">
      <PageHeader
        title={props.title}
        breadcrumbs={props.breadcrumbs}
        subtitle={props.subtitle}
        actions={
          <>
            <IconButton
              label={labels.refresh}
              icon={
                <RotateCw
                  className={refreshing ? "animate-spin motion-reduce:animate-none" : undefined}
                />
              }
              disabled={refreshing || props.refreshDisabled}
              onClick={() => void onRefresh()}
            />
            {props.menu}
            <Button
              size="sm"
              variant={selection.active ? "secondary" : "outline"}
              disabled={items.length === 0}
              onClick={selection.active ? selection.exit : selection.enter}
            >
              <ListChecks />
              {labels.select}
            </Button>
            {props.extraActions}
            <Button size="sm" disabled={props.addDisabled} onClick={props.onAdd}>
              <Plus />
              {labels.add}
            </Button>
          </>
        }
      />

      {props.header}

      {props.replacement ?? (
        <>
          <InstructionFilesSection files={props.instructionFiles} showReaders={props.showReaders} />
          {props.sections}
          {props.presetBar}
          {props.notices}

          <LocalSkillToolbar
            filters={filters}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            searchPlaceholder={labels.search}
            summary={
              filters.isFiltering
                ? t("localSkills.shownOf", { shown: filters.filtered.length, total: items.length })
                : undefined
            }
          >
            {props.toolbarFilters}
          </LocalSkillToolbar>

          <SelectionToolbar selection={selection}>{props.selectionActions}</SelectionToolbar>

          {skills}
        </>
      )}

      {props.after}
      {props.children}
    </div>
  );
}
