import {
  ApiError,
  type ErrorCode,
  MARKETPLACE_NAME,
  MARKETPLACE_URL,
  type MarketBoard,
  type MarketSkill,
} from "@loadout/shared";
import { Link } from "@tanstack/react-router";
import { ExternalLink, SearchX, Store } from "lucide-react";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { Pager, pageCount, pageSlice } from "@/components/Pager";
import { SearchInput } from "@/components/SearchInput";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DEFAULT_MARKET_BOARD,
  MARKET_BOARDS,
  MARKET_PAGE_SIZE,
  MARKET_SEARCH_DEBOUNCE_MS,
  MARKET_SEARCH_LIMIT_MAX,
  MARKET_SEARCH_LIMIT_STEP,
  MARKET_SEARCH_MIN_CHARS,
  MARKET_SKELETON_COUNT,
  SOURCE_FILTER_ALL,
} from "@/features/install/constants";
import { filterBySource, marketSkillUrl, sourceOptions } from "@/features/install/market-filters";
import { MarketSkillCard } from "@/features/install/MarketSkillCard";
import { useInstallTask } from "@/features/install/use-install-task";
import { useOpenExternal } from "@/hooks/mutations/app";
import { marketTaskKey, useInstallFromMarket } from "@/hooks/mutations/install";
import { useMarketBoard, useMarketSearch } from "@/hooks/queries/install";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";

const GRID_CLASS = "grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3";
const CONNECTION_ERROR_CODES: ReadonlySet<ErrorCode> = new Set(["NETWORK", "TIMEOUT"]);

function MarketSkeleton(): ReactNode {
  return (
    <div className={GRID_CLASS} aria-hidden="true">
      {Array.from({ length: MARKET_SKELETON_COUNT }, (_, index) => (
        <div key={index} className="flex min-h-28 flex-col gap-2 rounded-lg border bg-card p-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <div className="mt-auto flex items-center justify-between pt-2">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Browse the marketplace boards or search it, narrow by contributor, and install. */
export function MarketTab(): ReactNode {
  const { t } = useTranslation();
  const top = useRef<HTMLDivElement>(null);
  const [board, setBoard] = useState<MarketBoard>(DEFAULT_MARKET_BOARD);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(MARKET_SEARCH_LIMIT_STEP);
  const [source, setSource] = useState<string>(SOURCE_FILTER_ALL);
  const [page, setPage] = useState(0);

  const debouncedQuery = useDebouncedValue(query, MARKET_SEARCH_DEBOUNCE_MS).trim();
  const searching = debouncedQuery.length >= MARKET_SEARCH_MIN_CHARS;
  const boardQuery = useMarketBoard(board, !searching);
  const searchQuery = useMarketSearch(searching ? debouncedQuery : "", limit);
  const active = searching ? searchQuery : boardQuery;

  const { task, cancel } = useInstallTask();
  const install = useInstallFromMarket();
  const openExternal = useOpenExternal();

  const results = useMemo(() => active.data ?? [], [active.data]);
  const sources = useMemo(() => sourceOptions(results), [results]);
  const filtered = useMemo(() => filterBySource(results, source), [results, source]);

  // Boards arrive whole and are paged here; search shows everything loaded and grows by "Load more".
  const lastPage = pageCount(filtered.length, MARKET_PAGE_SIZE) - 1;
  const currentPage = Math.min(page, lastPage);
  const visible = searching ? filtered : pageSlice(filtered, currentPage, MARKET_PAGE_SIZE);
  const canLoadMore = searching && results.length >= limit && limit < MARKET_SEARCH_LIMIT_MAX;

  const resetView = (): void => {
    setPage(0);
    setSource(SOURCE_FILTER_ALL);
  };

  const changePage = (next: number): void => {
    setPage(next);
    top.current?.scrollIntoView({ block: "start" });
  };

  const connectionError =
    active.error instanceof ApiError && CONNECTION_ERROR_CODES.has(active.error.code);

  return (
    <div className="flex flex-col gap-4">
      <div ref={top} className="flex scroll-mt-5 flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={board}
          aria-label={t("install.market.boardLabel")}
          disabled={searching}
          onValueChange={(value) => {
            const next = MARKET_BOARDS.find((entry) => entry === value);
            if (!next) return;
            setBoard(next);
            resetView();
          }}
        >
          {MARKET_BOARDS.map((entry) => (
            <ToggleGroupItem key={entry} value={entry} className="px-3">
              {t(`install.market.boards.${entry}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <SearchInput
          value={query}
          placeholder={t("install.market.searchPlaceholder", { marketplace: MARKETPLACE_NAME })}
          className="w-72"
          onChange={(value) => {
            setQuery(value);
            setLimit(MARKET_SEARCH_LIMIT_STEP);
            resetView();
          }}
        />

        <Select
          value={source}
          onValueChange={(value) => {
            setSource(value);
            setPage(0);
          }}
        >
          <SelectTrigger
            size="sm"
            className="max-w-64 font-mono text-xs"
            aria-label={t("install.market.sourceFilter")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SOURCE_FILTER_ALL} className="font-sans text-sm">
              {t("install.market.allSources")}
            </SelectItem>
            {sources.length > 0 ? <SelectSeparator /> : null}
            {source !== SOURCE_FILTER_ALL && !sources.some((entry) => entry.source === source) ? (
              <SelectItem value={source} className="font-mono text-xs">
                {source}
              </SelectItem>
            ) : null}
            {sources.map((entry) => (
              <SelectItem key={entry.source} value={entry.source} className="font-mono text-xs">
                {entry.source}
                <span className="text-muted-foreground tabular-nums">{entry.count}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {active.isFetching && !active.isPending ? (
          <Spinner className="size-4 text-muted-foreground" />
        ) : null}

        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => openExternal.mutate(MARKETPLACE_URL)}
        >
          <ExternalLink />
          {t("install.market.browseSite", { marketplace: MARKETPLACE_NAME })}
        </Button>
      </div>

      {searching ? (
        <p className="-mt-2 text-xs text-muted-foreground">
          {t("install.market.searchScope", { marketplace: MARKETPLACE_NAME })}
        </p>
      ) : null}

      {active.isPending ? (
        <MarketSkeleton />
      ) : active.isError ? (
        <div className="flex flex-col items-center">
          <ErrorState
            error={active.error}
            title={t("install.market.loadFailed", { marketplace: MARKETPLACE_NAME })}
            onRetry={() => void active.refetch()}
          />
          {connectionError ? (
            <p className="-mt-8 max-w-md text-center text-sm text-muted-foreground">
              {t("install.errors.proxyHint")}{" "}
              <Link
                to="/settings"
                search={{ section: "network" }}
                className="rounded text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {t("install.errors.openSettings")}
              </Link>
            </p>
          ) : null}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={results.length === 0 && !searching ? Store : SearchX}
          title={t("install.market.emptyTitle")}
          description={t(
            source === SOURCE_FILTER_ALL
              ? "install.market.emptyDescription"
              : "install.market.emptyFiltered",
          )}
          action={
            source !== SOURCE_FILTER_ALL
              ? {
                  label: t("install.market.clearFilter"),
                  onClick: () => setSource(SOURCE_FILTER_ALL),
                }
              : searching
                ? { label: t("common.clearSearch"), onClick: () => setQuery("") }
                : undefined
          }
        />
      ) : (
        <>
          <div
            className={cn(
              GRID_CLASS,
              "transition-opacity duration-150",
              active.isPlaceholderData && "opacity-60",
            )}
          >
            {visible.map((skill: MarketSkill) => (
              <MarketSkillCard
                key={skill.id}
                skill={skill}
                task={task(marketTaskKey(skill))}
                onInstall={(entry) => void install(entry)}
                onCancel={(entry) => cancel(marketTaskKey(entry))}
                onViewOnWeb={(entry) => openExternal.mutate(marketSkillUrl(MARKETPLACE_URL, entry))}
                onFilterSource={(next) => {
                  setSource(next);
                  setPage(0);
                }}
              />
            ))}
          </div>

          {searching ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground tabular-nums">
                {t("install.market.resultCount", { count: filtered.length })}
              </p>
              {canLoadMore ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={searchQuery.isFetching}
                  onClick={() =>
                    setLimit((current) =>
                      Math.min(MARKET_SEARCH_LIMIT_MAX, current + MARKET_SEARCH_LIMIT_STEP),
                    )
                  }
                >
                  {searchQuery.isFetching ? <Spinner /> : null}
                  {t("install.market.loadMore")}
                </Button>
              ) : null}
            </div>
          ) : (
            <Pager
              page={currentPage}
              pageSize={MARKET_PAGE_SIZE}
              total={filtered.length}
              onPageChange={changePage}
            />
          )}
        </>
      )}
    </div>
  );
}
