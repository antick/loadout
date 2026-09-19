import type { Skill } from "@skillboard/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowUpCircle,
  FilterX,
  Library,
  ListChecks,
  Plus,
  RefreshCw,
  ScanSearch,
  Trash2,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { IconButton } from "@/components/IconButton";
import { PageHeader } from "@/components/layout/PageHeader";
import { SelectionToolbar } from "@/components/SelectionToolbar";
import { SkillAgentBadges } from "@/components/SkillAgentBadges";
import { SkillCard } from "@/components/SkillCard";
import { SkillRow } from "@/components/SkillRow";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { LibraryBanners } from "@/features/library/LibraryBanners";
import {
  DEFAULT_SORT_MODE,
  EMPTY_FILTERS,
  filterSkills,
  hasUpdate,
  isFiltering,
  type LibraryFilters,
  type SortMode,
} from "@/features/library/library-filters";
import { LibrarySelectionActions } from "@/features/library/LibrarySelectionActions";
import { LibraryToolbar } from "@/features/library/LibraryToolbar";
import { SkillDetailSheet } from "@/features/library/SkillDetailSheet";
import { useDeleteSkills } from "@/features/library/use-delete-skills";
import { useCheckAllUpdates, useUpdateSkills } from "@/hooks/mutations/library";
import { useAllTags, useSkills } from "@/hooks/queries/skills";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useSelection } from "@/hooks/use-selection";
import { useViewMode } from "@/hooks/use-view-mode";
import { cn } from "@/lib/utils";

const VIEW_MODE_SCOPE = "library";
const SORT_STORAGE_KEY = "library.sort";
const GRID_CLASS = "grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))]";
const LIST_CLASS = "flex flex-col gap-1.5";
const SKELETON_ITEMS = [0, 1, 2, 3, 4, 5];

export interface LibraryPageProps {
  /** Skill whose detail panel is open; comes from the URL so other screens can deep-link. */
  openSkillId: string | null;
  onOpenSkill: (skillId: string | null) => void;
}

/** Every skill in the library: search, filter, deploy per agent, batch actions, detail panel. */
export function LibraryPage({ openSkillId, onOpenSkill }: LibraryPageProps): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const skills = useSkills();
  const allTags = useAllTags();
  const checkAll = useCheckAllUpdates();
  const updateMany = useUpdateSkills();
  const deleteSkills = useDeleteSkills();
  const [viewMode, setViewMode] = useViewMode(VIEW_MODE_SCOPE);
  const [sort, setSort] = usePersistedState<SortMode>(SORT_STORAGE_KEY, DEFAULT_SORT_MODE);
  const [rest, setRest] = useState(EMPTY_FILTERS);

  const filters = useMemo<LibraryFilters>(() => ({ ...rest, sort }), [rest, sort]);
  const all = skills.data;
  const visible = useMemo(() => filterSkills(all ?? [], filters), [all, filters]);
  const visibleIds = useMemo(() => visible.map((skill) => skill.id), [visible]);
  const selection = useSelection(visibleIds);
  const selected = useMemo(
    () => visible.filter((skill) => selection.isSelected(skill.id)),
    [visible, selection],
  );
  const updatable = useMemo(() => (all ?? []).filter(hasUpdate), [all]);

  const patchFilters = ({ sort: nextSort, ...patch }: Partial<LibraryFilters>): void => {
    if (nextSort) setSort(nextSort);
    if (Object.keys(patch).length > 0) setRest((previous) => ({ ...previous, ...patch }));
  };

  const Item = viewMode === "grid" ? SkillCard : SkillRow;
  const total = all?.length ?? 0;

  const renderItem = (skill: Skill): ReactNode => (
    <Item
      key={skill.id}
      skill={skill}
      current={skill.id === openSkillId}
      selecting={selection.active}
      selected={selection.isSelected(skill.id)}
      onSelectToggle={(target, modifiers) => selection.toggle(target.id, modifiers)}
      onOpen={(target) => onOpenSkill(target.id)}
      footer={<SkillAgentBadges skill={skill} />}
      actions={
        <IconButton
          size="icon-xs"
          label={t("library.deleteSkill", { name: skill.name })}
          icon={<Trash2 />}
          className="text-muted-foreground hover:text-danger"
          onClick={() => void deleteSkills([skill])}
        />
      }
    />
  );

  let content: ReactNode;
  if (skills.isPending) {
    content = (
      <div className={viewMode === "grid" ? GRID_CLASS : LIST_CLASS}>
        {SKELETON_ITEMS.map((item) => (
          <Skeleton
            key={item}
            className={cn("rounded-lg", viewMode === "grid" ? "h-36" : "h-12")}
          />
        ))}
      </div>
    );
  } else if (skills.isError) {
    content = <ErrorState error={skills.error} onRetry={() => void skills.refetch()} />;
  } else if (total === 0) {
    content = (
      <EmptyState
        icon={Library}
        title={t("library.empty.title")}
        description={t("library.empty.description")}
        action={{
          label: t("library.empty.install"),
          icon: Plus,
          onClick: () => void navigate({ to: "/install" }),
        }}
        className="flex-1"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => void navigate({ to: "/install", search: { tab: "scan" } })}
        >
          <ScanSearch />
          {t("library.empty.scan")}
        </Button>
      </EmptyState>
    );
  } else if (visible.length === 0) {
    content = (
      <EmptyState
        icon={FilterX}
        title={t("library.noMatches.title")}
        description={t("library.noMatches.description")}
        action={{ label: t("library.noMatches.clear"), onClick: () => setRest(EMPTY_FILTERS) }}
        className="flex-1"
      />
    );
  } else {
    content = (
      <div className={viewMode === "grid" ? GRID_CLASS : LIST_CLASS}>{visible.map(renderItem)}</div>
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-4 px-6 py-5">
      <PageHeader
        title={t("nav.library")}
        subtitle={
          skills.isSuccess
            ? isFiltering(filters)
              ? t("library.countFiltered", { shown: visible.length, count: total })
              : t("library.count", { count: total })
            : undefined
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={checkAll.isPending || total === 0}
              onClick={() => checkAll.mutate()}
              aria-label={t("library.checkUpdates")}
              title={t("library.checkUpdates")}
            >
              {checkAll.isPending ? <Spinner /> : <RefreshCw />}
              <span className="max-xl:sr-only">{t("library.checkUpdates")}</span>
            </Button>
            {updatable.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                disabled={updateMany.isPending}
                onClick={() => updateMany.mutate(updatable.map((skill) => skill.id))}
              >
                {updateMany.isPending ? <Spinner /> : <ArrowUpCircle className="text-info" />}
                {t("library.updateAll", { count: updatable.length })}
              </Button>
            ) : null}
            <Button
              variant={selection.active ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={selection.active}
              disabled={total === 0}
              onClick={selection.active ? selection.exit : selection.enter}
              title={t("library.select")}
            >
              <ListChecks />
              <span className="max-xl:sr-only">{t("library.select")}</span>
            </Button>
            <Button size="sm" asChild>
              <Link to="/install">
                <Plus />
                {t("library.install")}
              </Link>
            </Button>
          </>
        }
      />

      <LibraryBanners
        updateCount={updatable.length}
        viewingUpdates={filters.status === "updates"}
        onViewUpdates={() => setRest({ ...EMPTY_FILTERS, status: "updates" })}
      />

      {total > 0 ? (
        <LibraryToolbar
          filters={filters}
          onChange={patchFilters}
          tags={allTags.data ?? []}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      ) : null}

      <SelectionToolbar selection={selection}>
        <LibrarySelectionActions skills={selected} onDone={selection.exit} />
      </SelectionToolbar>

      {content}

      <SkillDetailSheet skillId={openSkillId} onClose={() => onOpenSkill(null)} />
    </div>
  );
}
