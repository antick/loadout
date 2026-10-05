import {
  API_TIMEOUT_MS,
  CLAWHUB_NAME,
  MARKETPLACE_NAME,
  MARKET_SEARCH_DEFAULT_LIMIT,
  MARKETPLACE_URL,
  MINUTE_MS,
  type MarketApi,
  type MarketBoard,
  type MarketListing,
  type MarketProvider,
  type MarketSkill,
  type MarketSkillDetail,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { AppError, invalid, isAppError, isUnanswered } from "../errors";
import { type Download, MAX_ANSWER_BYTES, jsonOptions, readJson } from "../install/download";
import type { SkillStore } from "../skills/store";
import type { ClawhubClient, ClawhubEntry } from "./clawhub";
import { type FetchedDetail, type MarketDetailParts, createMarketDetail } from "./detail";
import { type MarketEntry, parseBoardHtml, parseSearchResponse } from "./parse";

export interface MarketServiceDeps {
  store: SkillStore;
  /** Shared with the installer: the one HTTP client, proxy-aware in the desktop app. */
  download: Download;
  /** Shared with the installer and the updater. */
  clawhub: ClawhubClient;
}

export interface MarketService {
  api: MarketApi;
}

const BOARD_PATHS: Partial<Record<MarketBoard, string>> = {
  hot: "/hot",
  trending: "/trending",
  all_time: "/",
};
const SEARCH_PATH = "/api/search";
const BOARD_CACHE_TTL_MS = 5 * MINUTE_MS;
const BOARD_CACHE_PREFIX = "board:";
const SEARCH_CACHE_PREFIX = "search:";
/** Searches kept for offline use; the oldest go first. */
const MAX_CACHED_SEARCHES = 100;
const DETAIL_CACHE_PREFIX = "detail:";
/** Audits and documents change far less often than rankings. */
const DETAIL_CACHE_TTL_MS = 30 * MINUTE_MS;
const MAX_SEARCH_LIMIT = 200;
/** ClawHub answers are cached under their own keys, apart from skills.sh's. */
const CLAWHUB_CACHE_PREFIX = "clawhub:";

interface CacheRow {
  data: string;
  fetched_at: number;
}

export function createMarketService(ctx: CoreContext, deps: MarketServiceDeps): MarketService {
  const { store, download, clawhub } = deps;
  const fetchDetail = createMarketDetail({ download });
  /** Every marketplace call: its name in messages, and a short timeout. */
  const marketplace = { label: MARKETPLACE_NAME, timeoutMs: API_TIMEOUT_MS } as const;

  function readCache<T>(
    key: string,
    ttlMs: number,
  ): { entries: T; fresh: boolean; fetchedAt: number } | null {
    const row = ctx.db.get<CacheRow>(
      "SELECT data, fetched_at FROM market_cache WHERE cache_key = ?",
      key,
    );
    if (!row) return null;
    try {
      const entries = JSON.parse(row.data) as T;
      return { entries, fresh: Date.now() - row.fetched_at < ttlMs, fetchedAt: row.fetched_at };
    } catch {
      return null;
    }
  }

  function writeCache(key: string, entries: unknown): void {
    ctx.db.run(
      `INSERT INTO market_cache(cache_key, data, fetched_at) VALUES(?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at`,
      key,
      JSON.stringify(entries),
      Date.now(),
    );
  }

  /** Only the latest searches are kept for offline use, per marketplace. */
  function pruneSearches(): void {
    for (const prefix of [SEARCH_CACHE_PREFIX, `${CLAWHUB_CACHE_PREFIX}${SEARCH_CACHE_PREFIX}`]) {
      ctx.db.run(
        `DELETE FROM market_cache WHERE cache_key LIKE ? AND cache_key NOT IN (
           SELECT cache_key FROM market_cache WHERE cache_key LIKE ?
           ORDER BY fetched_at DESC LIMIT ?)`,
        `${prefix}%`,
        `${prefix}%`,
        MAX_CACHED_SEARCHES,
      );
    }
  }

  /**
   * `installed` from the library, by `owner/repo/skill` or `owner/slug`. Worked out on every call,
   * never cached: the library changes under the cache.
   */
  function withInstalled(
    sourceType: "marketplace" | "clawhub",
    skills: ClawhubEntry[],
  ): MarketSkill[] {
    const installed = new Set(
      store
        .list()
        .flatMap((s) => (s.sourceType === sourceType && s.sourceRef ? [s.sourceRef] : [])),
    );
    return skills.map((skill) => ({
      ...skill,
      installed: installed.has(`${skill.source}/${skill.skillId}`),
    }));
  }

  /** skills.sh entries as listed skills. */
  function skillsSh(entries: MarketEntry[]): MarketSkill[] {
    const skills = entries.map((entry) => ({
      provider: "skills_sh" as const,
      id: `${entry.source}/${entry.skillId}`,
      ...entry,
      summary: null,
      version: null,
    }));
    return withInstalled("marketplace", skills);
  }

  function clawhubSkills(entries: ClawhubEntry[]): MarketSkill[] {
    return withInstalled("clawhub", entries);
  }

  /**
   * A listing from the cache while it is younger than `ttlMs`, else fetched and cached. Offline
   * with an earlier answer beats an error page: the listing says how old it is.
   */
  async function cachedListing<T>(
    key: string,
    ttlMs: number,
    fetchEntries: () => Promise<T[]>,
    decorate: (entries: T[]) => MarketSkill[],
    what: string,
  ): Promise<MarketListing> {
    const cached = readCache<T[]>(key, ttlMs);
    if (cached?.fresh) return { skills: decorate(cached.entries), cachedAt: null };
    try {
      const entries = await fetchEntries();
      writeCache(key, entries);
      return { skills: decorate(entries), cachedAt: null };
    } catch (error) {
      if (!cached || !isAppError(error)) throw error;
      ctx.log.warn(`Showing a cached ${what}`, error);
      return { skills: decorate(cached.entries), cachedAt: cached.fetchedAt };
    }
  }

  /**
   * A skill's detail, fresh from the cache or fetched. When the fetch goes unanswered (offline,
   * server trouble) an earlier full copy is shown with its age, as boards and searches are.
   */
  async function detailOrCached(
    key: string,
    marketplaceName: string,
    fetchDetailParts: () => Promise<FetchedDetail>,
  ): Promise<MarketSkillDetail> {
    const cached = readCache<MarketDetailParts>(key, DETAIL_CACHE_TTL_MS);
    if (cached?.fresh) return { ...cached.entries, cachedAt: null };
    const stale = (error: unknown): MarketSkillDetail | null => {
      if (!cached) return null;
      ctx.log.warn(`Showing a cached ${marketplaceName} skill detail`, error);
      return { ...cached.entries, cachedAt: cached.fetchedAt };
    };
    let fetched: FetchedDetail;
    try {
      fetched = await fetchDetailParts();
    } catch (error) {
      // A "no" from the marketplace (gone, ambiguous) is its answer; only silence falls back.
      if (!isUnanswered(error)) throw error;
      const older = stale(error);
      if (older) return older;
      throw error;
    }
    const { detail, unanswered } = fetched;
    if (unanswered) {
      // A half answer is shown only without an earlier copy, and never kept.
      return stale(`${key} went partly unanswered`) ?? { ...detail, cachedAt: null };
    }
    if (detail.audits !== null && detail.document !== null) writeCache(key, detail);
    return { ...detail, cachedAt: null };
  }

  async function fetchBoard(board: MarketBoard): Promise<MarketEntry[]> {
    const path = BOARD_PATHS[board];
    if (!path) throw invalid(`Unknown marketplace board: ${board}`);
    const page = await download(`${MARKETPLACE_URL}${path}`, {
      ...marketplace,
      accept: "text/html",
      maxBytes: MAX_ANSWER_BYTES,
      subject: "The listing",
    });
    const entries = parseBoardHtml(page.toString("utf8"));
    if (entries.length === 0) {
      // An empty board means the page changed shape, not that the marketplace is empty.
      throw new AppError("NETWORK", `The ${MARKETPLACE_NAME} listing could not be read`);
    }
    return entries;
  }

  const api: MarketApi = {
    board: async (board, provider: MarketProvider = "skills_sh") => {
      const key = `${BOARD_CACHE_PREFIX}${board}`;
      if (provider === "clawhub") {
        return cachedListing(
          `${CLAWHUB_CACHE_PREFIX}${key}`,
          BOARD_CACHE_TTL_MS,
          () => clawhub.list(board),
          clawhubSkills,
          `${CLAWHUB_NAME} board`,
        );
      }
      return cachedListing(
        key,
        BOARD_CACHE_TTL_MS,
        () => fetchBoard(board),
        skillsSh,
        `${MARKETPLACE_NAME} board`,
      );
    },

    search: async (query, limit = MARKET_SEARCH_DEFAULT_LIMIT, provider = "skills_sh") => {
      const q = query.trim();
      if (!q) return { skills: [], cachedAt: null };
      const capped = Math.min(
        Math.max(Math.floor(limit) || MARKET_SEARCH_DEFAULT_LIMIT, 1),
        MAX_SEARCH_LIMIT,
      );
      const key = `${SEARCH_CACHE_PREFIX}${capped}:${q.toLowerCase()}`;
      const listing =
        provider === "clawhub"
          ? await cachedListing(
              `${CLAWHUB_CACHE_PREFIX}${key}`,
              BOARD_CACHE_TTL_MS,
              () => clawhub.search(q, capped),
              clawhubSkills,
              `${CLAWHUB_NAME} search`,
            )
          : await cachedListing(
              key,
              // skills.sh is always asked; its answers are kept for offline use only.
              0,
              async () => {
                const url = `${MARKETPLACE_URL}${SEARCH_PATH}?q=${encodeURIComponent(q)}&limit=${capped}`;
                const answer = await download(
                  url,
                  jsonOptions({ ...marketplace, subject: "The search" }),
                );
                return parseSearchResponse(readJson(answer, MARKETPLACE_NAME)).slice(0, capped);
              },
              skillsSh,
              `${MARKETPLACE_NAME} search`,
            );
      pruneSearches();
      return listing;
    },

    detail: async (source, skillId, provider = "skills_sh") => {
      const id = `${source.trim()}/${skillId.trim()}`;
      if (provider === "clawhub") {
        return detailOrCached(
          `${CLAWHUB_CACHE_PREFIX}${DETAIL_CACHE_PREFIX}${id}`,
          CLAWHUB_NAME,
          async () => {
            const found = await clawhub.detail(source.trim() || null, skillId.trim());
            const audits = await clawhub.audits(found.owner, found.slug);
            return { detail: { ...found, audits }, unanswered: audits === null };
          },
        );
      }
      return detailOrCached(`${DETAIL_CACHE_PREFIX}${id}`, MARKETPLACE_NAME, () =>
        fetchDetail(source, skillId),
      );
    },
  };

  return { api };
}
