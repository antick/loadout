import {
  ApiError,
  DEFAULT_MARKET_PROVIDER,
  type ErrorCode,
  MARKET_BOARDS_OF,
  MARKET_PROVIDERS,
  type MarketBoard,
  type MarketProvider,
  type MarketSkill,
  formatRelative,
} from "@loadout/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { CloudOff, ExternalLink, Package, RefreshCw, SearchX, Store } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { InlineNotice } from "@/components/InlineNotice";
import { SearchInput } from "@/components/SearchInput";
import { Skeletons } from "@/components/Skeletons";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DEFAULT_MARKET_BOARD_OF,
  MARKET_PAGE_SIZE,
  MARKET_PROVIDER_NAMES,
  MARKET_PROVIDER_URLS,
  MARKET_SEARCH_DEBOUNCE_MS,
  MARKET_SEARCH_LIMIT_MAX,
  MARKET_SEARCH_LIMIT_STEP,
  MARKET_SEARCH_MIN_CHARS,
  MARKET_SKELETON_COUNT,
} from "@/features/install/constants";
import { marketTaskKey, useInstallFromMarket } from "@/features/install/install-mutations";
import { useMarketBoard, useMarketSearch } from "@/features/install/install-queries";
import { filterBySource, marketSkillUrl, sourceOptions } from "@/features/install/market-filters";
import { MarketDetailSheet } from "@/features/install/MarketDetailSheet";
import { MarketSkillCard } from "@/features/install/MarketSkillCard";
import { useInstallTasks } from "@/features/install/use-install-task";
import { useOpenExternal } from "@/hooks/mutations/app";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { cn } from "@/lib/utils";
import { FILTER_ALL, STORAGE_KEYS } from "@/lib/constants";
import { MARKET_GRID_CLASS } from "@/lib/styles";

const PROVIDER_ICONS: Record<MarketProvider, typeof Store> = { skills_sh: Store, clawhub: Package };
const CONNECTION_ERROR_CODES: ReadonlySet<ErrorCode> = new Set(["NETWORK", "TIMEOUT"]);

/** Browse a marketplace's boards or search it, narrow by contributor, and install. */
export function MarketTab(): ReactNode {
  const { t } = useTranslation();
  const [provider, setProvider] = usePersistedState<MarketProvider>(
    STORAGE_KEYS.marketProvider,
    DEFAULT_MARKET_PROVIDER,
  );
  const [board, setBoard] = useState<MarketBoard>(DEFAULT_MARKET_BOARD_OF[provider]);
  const boards = MARKET_BOARDS_OF[provider];
  const marketplace = MARKET_PROVIDER_NAMES[provider];
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(MARKET_SEARCH_LIMIT_STEP);
  const [source, setSource] = useState<string>(FILTER_ALL);
  const [shown, setShown] = useState(MARKET_PAGE_SIZE);
  const [detailFor, setDetailFor] = useState<MarketSkill | null>(null);
  const navigate = useNavigate();

  const debouncedQuery = useDebouncedValue(query, MARKET_SEARCH_DEBOUNCE_MS).trim();
  const searching = debouncedQuery.length >= MARKET_SEARCH_MIN_CHARS;
  const boardQuery = useMarketBoard(provider, board, !searching);
  const searchQuery = useMarketSearch(provider, searching ? debouncedQuery : "", limit);
  const active = searching ? searchQuery : boardQuery;

  const { task, cancel } = useInstallTasks();
  const install = useInstallFromMarket();
  const openExternal = useOpenExternal();

  const results = useMemo(() => active.data?.skills ?? [], [active.data]);
  const cachedAt = active.data?.cachedAt ?? null;
  const sources = useMemo(() => sourceOptions(results), [results]);
  const filtered = useMemo(() => filterBySource(results, source), [results, source]);

  // "Show more" shows more of a board, which arrives whole, and asks a search for more results.
  const visible = searching ? filtered : filtered.slice(0, shown);
  const canShowMore = searching
    ? results.length >= limit && limit < MARKET_SEARCH_LIMIT_MAX
    : filtered.length > shown;
  const showMore = (): void => {
    if (searching) {
      setLimit((current) => Math.min(MARKET_SEARCH_LIMIT_MAX, current + MARKET_SEARCH_LIMIT_STEP));
    } else setShown((current) => current + MARKET_PAGE_SIZE);
  };

  const resetView = (): void => {
    setShown(MARKET_PAGE_SIZE);
    setSource(FILTER_ALL);
  };

  const connectionError =
    active.error instanceof ApiError && CONNECTION_ERROR_CODES.has(active.error.code);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={provider}
          aria-label={t("install.market.providerLabel")}
          onValueChange={(value) => {
            const next = MARKET_PROVIDERS.find((entry) => entry === value);
            if (!next) return;
            setProvider(next);
            setBoard(DEFAULT_MARKET_BOARD_OF[next]);
            resetView();
          }}
        >
          {MARKET_PROVIDERS.map((entry) => {
            const Icon = PROVIDER_ICONS[entry];
            return (
              <ToggleGroupItem key={entry} value={entry} className="gap-1.5 px-3">
                <Icon />
                {MARKET_PROVIDER_NAMES[entry]}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={board}
          aria-label={t("install.market.boardLabel")}
          disabled={searching}
          onValueChange={(value) => {
            const next = boards.find((entry) => entry === value);
            if (!next) return;
            setBoard(next);
            resetView();
          }}
        >
          {boards.map((entry) => (
            <ToggleGroupItem key={entry} value={entry} className="px-3">
              {t(`install.market.boards.${entry}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <SearchInput
          value={query}
          placeholder={t("install.market.searchPlaceholder", { marketplace })}
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
            setShown(MARKET_PAGE_SIZE);
          }}
        >
          <SelectTrigger
            size="sm"
            className="max-w-64 font-mono text-xs"
            aria-label={t(`install.market.sourceFilter.${provider}`)}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FILTER_ALL} className="font-sans text-sm">
              {t(`install.market.allSources.${provider}`)}
            </SelectItem>
            {sources.length > 0 ? <SelectSeparator /> : null}
            {source !== FILTER_ALL && !sources.some((entry) => entry.source === source) ? (
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
          <Spinner label={t("common.loading")} className="size-4 text-muted-foreground" />
        ) : null}

        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => openExternal.mutate(MARKET_PROVIDER_URLS[provider])}
        >
          <ExternalLink />
          {t("install.market.browseSite", { marketplace })}
        </Button>
      </div>

      {searching ? (
        <p className="-mt-2 text-xs text-muted-foreground">
          {t("install.market.searchScope", { marketplace })}
        </p>
      ) : null}

      {cachedAt !== null && !active.isPending ? (
        <InlineNotice
          tone="warning"
          icon={CloudOff}
          actions={
            <Button
              variant="ghost"
              size="xs"
              disabled={active.isFetching}
              onClick={() => void active.refetch()}
            >
              {active.isFetching ? <Spinner /> : <RefreshCw />}
              {t("install.market.retry")}
            </Button>
          }
        >
          {t("install.market.cached", { marketplace, when: formatRelative(cachedAt) })}
        </InlineNotice>
      ) : null}

      {active.isPending ? (
        <div className={MARKET_GRID_CLASS} aria-hidden="true">
          <Skeletons count={MARKET_SKELETON_COUNT} className="h-28 rounded-lg" />
        </div>
      ) : active.isError ? (
        <div className="flex flex-col items-center">
          <ErrorState
            error={active.error}
            title={t("install.market.loadFailed", { marketplace })}
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
            source === FILTER_ALL
              ? "install.market.emptyDescription"
              : "install.market.emptyFiltered",
          )}
          action={
            source !== FILTER_ALL
              ? {
                  label: t("install.market.clearFilter"),
                  onClick: () => setSource(FILTER_ALL),
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
              MARKET_GRID_CLASS,
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
                onViewOnWeb={(entry) => openExternal.mutate(marketSkillUrl(entry))}
                onOpen={setDetailFor}
                onFilterSource={(next) => {
                  setSource(next);
                  setShown(MARKET_PAGE_SIZE);
                }}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground tabular-nums">
              {t("install.market.resultCount", { count: filtered.length })}
            </p>
            {canShowMore ? (
              <Button
                variant="outline"
                size="sm"
                disabled={searching && searchQuery.isFetching}
                onClick={showMore}
              >
                {searching && searchQuery.isFetching ? <Spinner /> : null}
                {t("install.market.showMore")}
              </Button>
            ) : null}
          </div>
        </>
      )}

      <MarketDetailSheet
        skill={detailFor}
        task={detailFor ? task(marketTaskKey(detailFor)) : undefined}
        onInstall={(entry) => void install(entry)}
        onCancel={(entry) => cancel(marketTaskKey(entry))}
        onOpenLibrary={(skillId) => void navigate({ to: "/library", search: { skill: skillId } })}
        onClose={() => setDetailFor(null)}
      />
    </div>
  );
}
