import type { Skill } from "@loadout/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowUpCircle,
  CopyCheck,
  FilePlus2,
  FilterX,
  Library,
  ListChecks,
  MoreHorizontal,
  Plus,
  RefreshCw,
  ScanSearch,
  Send,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BatchDeployDialog } from "@/components/BatchDeployDialog";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { FavoriteButton } from "@/components/FavoriteButton";
import { IconButton } from "@/components/IconButton";
import { PageHeader } from "@/components/layout/PageHeader";
import { useShell } from "@/components/layout/shell-context";
import { SelectionToolbar } from "@/components/SelectionToolbar";
import { Skeletons } from "@/components/Skeletons";
import { UsageReadStatus } from "@/components/UsageReadStatus";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { useDuplicates } from "@/features/library/duplicates/duplicate-queries";
import { DuplicatesDialog } from "@/features/library/duplicates/DuplicatesDialog";
import { useCheckAllUpdates } from "@/features/library/library-mutations";
import { LibraryBanners } from "@/features/library/LibraryBanners";
import { groupLibraryBySource } from "@/features/library/library-groups";
import { LibraryGroups } from "@/features/library/LibraryGroups";
import { LibrarySkillItem } from "@/features/library/LibrarySkillItem";
import { LibraryMatrix } from "@/features/library/matrix/LibraryMatrix";
import { SkillAgentBadges } from "@/features/library/SkillAgentBadges";
import { SkillUsageNote } from "@/features/library/SkillUsageNote";
import {
  DEFAULT_SORT_MODE,
  EMPTY_FILTERS,
  FILTER_ALL,
  filterSkills,
  hasUpdate,
  isFiltering,
  type LibraryFilters,
  type SortMode,
  type StatusFilter,
  needsUsage,
} from "@/features/library/library-filters";
import { LibrarySelectionActions } from "@/features/library/LibrarySelectionActions";
import { LibraryToolbar } from "@/features/library/LibraryToolbar";
import { SkillDetailSheet } from "@/features/library/SkillDetailSheet";
import { useLibrarySkillActions } from "@/features/library/use-library-skill-actions";
import { useUpdateSkills } from "@/hooks/mutations/library";
import { useAvailableAgents } from "@/hooks/queries/agents";
import { useAllTags, useSkills } from "@/hooks/queries/skills";
import { useSafetyReports } from "@/hooks/queries/safety";
import { useSkillUsage } from "@/hooks/queries/usage";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useSelection } from "@/hooks/use-selection";
import { useViewMode } from "@/hooks/use-view-mode";
import type { LibraryViewMode } from "@/lib/constants";
import { cn } from "@/lib/utils";

const VIEW_MODE_SCOPE = "library";
const SORT_STORAGE_KEY = "library.sort";
const GROUP_STORAGE_KEY = "library.group-by-source";
const GRID_CLASS = "grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))]";
const LIST_CLASS = "flex flex-col gap-1.5";
const SKELETON_COUNT = 6;

export interface LibraryPageProps {
  /** Skill whose detail panel is open; comes from the URL so other screens can deep-link. */
  openSkillId: string | null;
  onOpenSkill: (skillId: string | null) => void;
  /** A status filter asked for from outside the page (the tray); applied once, then cleared. */
  requestedStatus: StatusFilter | null;
  /** Search text asked for from outside (the Sources page); applied once, then cleared. */
  requestedQuery: string | null;
  /** Favourites only, asked for from outside (the sidebar); applied once, then cleared. */
  requestedFavorites: boolean;
  onRequestApplied: () => void;
}

/** Every skill in the library: search, filter, deploy per agent, batch actions, detail panel. */
export function LibraryPage({
  openSkillId,
  onOpenSkill,
  requestedStatus,
  requestedQuery,
  requestedFavorites,
  onRequestApplied,
}: LibraryPageProps): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const shell = useShell();
  const skills = useSkills();
  const allTags = useAllTags();
  const checkAll = useCheckAllUpdates();
  const updateMany = useUpdateSkills();
  const actionsFor = useLibrarySkillActions();
  const [viewMode, setViewMode] = useViewMode<LibraryViewMode>(VIEW_MODE_SCOPE);
  const [sort, setSort] = usePersistedState<SortMode>(SORT_STORAGE_KEY, DEFAULT_SORT_MODE);
  const [groupBySource, setGroupBySource] = usePersistedState<boolean>(GROUP_STORAGE_KEY, false);
  const [rest, setRest] = useState(EMPTY_FILTERS);
  const [deployAllOpen, setDeployAllOpen] = useState(false);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const duplicates = useDuplicates();

  // A status or search asked for from outside replaces the filters once; the request is then
  // cleared.
  const request =
    requestedStatus || requestedQuery || requestedFavorites
      ? `${requestedStatus}\0${requestedQuery}\0${requestedFavorites}`
      : null;
  const [seenRequest, setSeenRequest] = useState<string | null>(null);
  if (request !== seenRequest) {
    setSeenRequest(request);
    if (request) {
      setRest({
        ...EMPTY_FILTERS,
        status: requestedStatus ?? EMPTY_FILTERS.status,
        query: requestedQuery ?? EMPTY_FILTERS.query,
        favorites: requestedFavorites,
      });
    }
  }
  useEffect(() => {
    if (request) onRequestApplied();
  }, [request, onRequestApplied]);

  const usage = useSkillUsage();
  // Usage filters and sorts stand down while tracking is off (they are not offered then).
  const filters = useMemo<LibraryFilters>(
    () => ({
      ...rest,
      status: !usage.enabled && needsUsage(rest.status) ? FILTER_ALL : rest.status,
      sort: !usage.enabled && needsUsage(sort) ? DEFAULT_SORT_MODE : sort,
    }),
    [rest, sort, usage.enabled],
  );
  const showUsage = usage.enabled && (needsUsage(filters.sort) || needsUsage(filters.status));
  const all = skills.data;
  // A skill removed while its panel is open (from the command line, or by a sync from another
  // computer) closes the panel instead of leaving it on an error. Only once the list has shown
  // the skill: one just installed may open before the list refetches.
  const listedOpenId = useRef<string | null>(null);
  useEffect(() => {
    if (!openSkillId || !all) return;
    if (all.some((skill) => skill.id === openSkillId)) listedOpenId.current = openSkillId;
    else if (listedOpenId.current === openSkillId) {
      listedOpenId.current = null;
      onOpenSkill(null);
    }
  }, [all, openSkillId, onOpenSkill]);
  const availableAgents = useAvailableAgents();
  const availableKeys = useMemo(
    () => new Set((availableAgents.data ?? []).map((agent) => agent.key)),
    [availableAgents.data],
  );
  const safety = useSafetyReports();
  const visible = useMemo(
    () =>
      filterSkills(
        all ?? [],
        filters,
        { enabled: usage.enabled, byId: usage.byId },
        availableKeys,
        safety,
      ),
    [all, filters, usage.enabled, usage.byId, availableKeys, safety],
  );
  // Sections change the order on screen; the selection follows it so shift-click ranges do too.
  const groups = useMemo(
    () => (groupBySource && viewMode !== "matrix" ? groupLibraryBySource(visible) : null),
    [groupBySource, viewMode, visible],
  );
  const visibleIds = useMemo(
    () => (groups ?? [{ skills: visible }]).flatMap((group) => group.skills.map((s) => s.id)),
    [groups, visible],
  );
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

  const total = all?.length ?? 0;

  const renderItem = (skill: Skill): ReactNode => (
    <LibrarySkillItem
      key={skill.id}
      skill={skill}
      layout={viewMode === "list" ? "list" : "grid"}
      current={skill.id === openSkillId}
      selecting={selection.active}
      selected={selection.isSelected(skill.id)}
      onSelectToggle={(target, modifiers) => selection.toggle(target.id, modifiers)}
      onOpen={(target) => onOpenSkill(target.id)}
      footer={
        <div className="flex min-w-0 items-center gap-3">
          <SkillAgentBadges skill={skill} />
          {showUsage ? <SkillUsageNote usage={usage.byId.get(skill.id)} /> : null}
        </div>
      }
      menuActions={actionsFor(skill)}
      actions={<FavoriteButton skill={skill} />}
    />
  );

  let content: ReactNode;
  if (skills.isPending) {
    content = (
      <div className={viewMode === "grid" ? GRID_CLASS : LIST_CLASS}>
        <Skeletons
          count={SKELETON_COUNT}
          className={cn("rounded-lg", viewMode === "grid" ? "h-36" : "h-12")}
        />
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
        <Button variant="outline" size="sm" onClick={() => shell.openNewSkill()}>
          <FilePlus2 />
          {t("library.empty.create")}
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
    content =
      viewMode === "matrix" ? (
        <LibraryMatrix
          skills={visible}
          agents={availableAgents.data ?? []}
          currentId={openSkillId}
          selecting={selection.active}
          isSelected={selection.isSelected}
          onSelectToggle={(target, modifiers) => selection.toggle(target.id, modifiers)}
          onOpen={(target) => onOpenSkill(target.id)}
        />
      ) : groups ? (
        <LibraryGroups
          groups={groups}
          itemsClassName={viewMode === "grid" ? GRID_CLASS : LIST_CLASS}
          renderItem={renderItem}
        />
      ) : (
        <div className={viewMode === "grid" ? GRID_CLASS : LIST_CLASS}>
          {visible.map(renderItem)}
        </div>
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton label={t("library.more")} icon={<MoreHorizontal />} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={checkAll.isPending || total === 0}
                  onSelect={() => checkAll.mutate()}
                >
                  <RefreshCw />
                  {t("library.checkUpdates")}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={total === 0} onSelect={() => setDeployAllOpen(true)}>
                  <Send />
                  {t("library.deployAll")}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={total < 2} onSelect={() => setDuplicatesOpen(true)}>
                  <CopyCheck />
                  {t("duplicates.find")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              onClick={() => shell.openNewSkill()}
              title={t("library.newSkill")}
            >
              <FilePlus2 />
              <span className="max-xl:sr-only">{t("library.newSkill")}</span>
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
        duplicateCount={duplicates.data?.pairs.length ?? 0}
        onReviewDuplicates={() => setDuplicatesOpen(true)}
      />

      {total > 0 ? (
        <LibraryToolbar
          filters={filters}
          onChange={patchFilters}
          tags={allTags.data ?? []}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          usageEnabled={usage.enabled}
          groupBySource={groupBySource}
          onGroupBySourceChange={setGroupBySource}
        />
      ) : null}

      {total > 0 && showUsage ? <UsageReadStatus usage={usage} className="-mt-2 self-end" /> : null}

      <SelectionToolbar selection={selection}>
        <LibrarySelectionActions skills={selected} onDone={selection.exit} />
      </SelectionToolbar>

      {content}

      <BatchDeployDialog
        open={deployAllOpen}
        onOpenChange={setDeployAllOpen}
        skills={all ?? []}
        all
      />

      <DuplicatesDialog open={duplicatesOpen} onOpenChange={setDuplicatesOpen} />

      <SkillDetailSheet skillId={openSkillId} onClose={() => onOpenSkill(null)} />
    </div>
  );
}
