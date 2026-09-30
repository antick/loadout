import {
  APP_SLUG,
  CLAWHUB_NAME,
  MARKETPLACE_NAME,
  MARKET_SEARCH_DEFAULT_LIMIT,
  MARKETPLACE_URL,
  type MarketApi,
  type MarketBoard,
  type MarketListing,
  type MarketProvider,
  type MarketSkill,
  type MarketSkillDetail,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { AppError, errorMessage, invalid, isAppError } from "../errors";
import { createDownload } from "../install/download";
import type { SkillStore } from "../skills/store";
import { type ClawhubClient, type ClawhubEntry, createClawhubClient } from "./clawhub";
import { createMarketDetail } from "./detail";
import { type MarketEntry, parseBoardHtml, parseSearchResponse } from "./parse";

export interface MarketServiceDeps {
  store: SkillStore;
  /**
   * HTTP client. The built-in `fetch` ignores the proxy setting, so the desktop app injects a
   * proxy-aware one; tests inject a fake.
   */
  fetchImpl?: typeof fetch;
  /** Shared with the installer and the updater; a fresh one when absent. */
  clawhub?: ClawhubClient;
}

export interface MarketService {
  api: MarketApi;
  clawhub: ClawhubClient;
}

const BOARD_PATHS: Partial<Record<MarketBoard, string>> = {
  hot: "/hot",
  trending: "/trending",
  all_time: "/",
};
const SEARCH_PATH = "/api/search";
const REQUEST_TIMEOUT_MS = 15_000;
const BOARD_CACHE_TTL_MS = 300_000;
const BOARD_CACHE_PREFIX = "board:";
const SEARCH_CACHE_PREFIX = "search:";
/** Searches kept for offline use; the oldest go first. */
const MAX_CACHED_SEARCHES = 100;
const DETAIL_CACHE_PREFIX = "detail:";
/** Audits and documents change far less often than rankings. */
const DETAIL_CACHE_TTL_MS = 1_800_000;
const MAX_SEARCH_LIMIT = 200;
/** ClawHub answers are cached under their own keys, apart from skills.sh's. */
const CLAWHUB_CACHE_PREFIX = "clawhub:";

interface CacheRow {
  data: string;
  fetched_at: number;
}

export function createMarketService(ctx: CoreContext, deps: MarketServiceDeps): MarketService {
  const { store } = deps;
  const fetchDetail = createMarketDetail({ download: createDownload(deps.fetchImpl) });
  const clawhub = deps.clawhub ?? createClawhubClient({ fetchImpl: deps.fetchImpl });

  async function request(url: string, accept: string): Promise<Response> {
    const fetchImpl = deps.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: { "User-Agent": APP_SLUG, Accept: accept },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new AppError("TIMEOUT", `${MARKETPLACE_NAME} did not answer in time`);
      }
      throw new AppError("NETWORK", `Could not reach ${MARKETPLACE_NAME}: ${errorMessage(error)}`);
    }
    if (!response.ok) {
      throw new AppError("NETWORK", `${MARKETPLACE_NAME} answered with HTTP ${response.status}`);
    }
    return response;
  }

  function readCache<T = MarketEntry[]>(
    key: string,
    ttlMs = BOARD_CACHE_TTL_MS,
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

  function live(entries: MarketEntry[]): MarketListing {
    return { skills: withInstalled(entries), cachedAt: null };
  }

  /** Offline with an earlier answer beats an error page; the caller says how old it is. */
  function orCached(
    error: unknown,
    cached: { entries: MarketEntry[]; fetchedAt: number } | null,
    what: string,
  ): MarketListing {
    if (!cached || !isAppError(error)) throw error;
    ctx.log.warn(`Showing a cached ${MARKETPLACE_NAME} ${what}`, error);
    return { skills: withInstalled(cached.entries), cachedAt: cached.fetchedAt };
  }

  /** `installed` is worked out on every call, never cached: the library changes under the cache. */
  function withInstalled(entries: MarketEntry[]): MarketSkill[] {
    const installed = new Set(
      store
        .list()
        .flatMap((s) => (s.sourceType === "marketplace" && s.sourceRef ? [s.sourceRef] : [])),
    );
    return entries.map((entry) => {
      const id = `${entry.source}/${entry.skillId}`;
      return {
        provider: "skills_sh" as const,
        id,
        ...entry,
        installed: installed.has(id),
        summary: null,
        version: null,
      };
    });
  }

  /** ClawHub entries with `installed` from the library, by `owner/slug`. */
  function withClawhubInstalled(entries: ClawhubEntry[]): MarketSkill[] {
    const installed = new Set(
      store.list().flatMap((s) => (s.sourceType === "clawhub" && s.sourceRef ? [s.sourceRef] : [])),
    );
    return entries.map((entry) => ({
      ...entry,
      installed: installed.has(`${entry.source}/${entry.skillId}`),
    }));
  }

  /** A ClawHub listing, cached like a skills.sh one and served from the cache when offline. */
  async function clawhubListing(
    key: string,
    ttlMs: number,
    fetchEntries: () => Promise<ClawhubEntry[]>,
    what: string,
  ): Promise<MarketListing> {
    const cached = readCache<ClawhubEntry[]>(key, ttlMs);
    if (cached?.fresh) return { skills: withClawhubInstalled(cached.entries), cachedAt: null };
    try {
      const entries = await fetchEntries();
      writeCache(key, entries);
      return { skills: withClawhubInstalled(entries), cachedAt: null };
    } catch (error) {
      if (!cached || !isAppError(error)) throw error;
      ctx.log.warn(`Showing a cached ${CLAWHUB_NAME} ${what}`, error);
      return { skills: withClawhubInstalled(cached.entries), cachedAt: cached.fetchedAt };
    }
  }

  async function fetchBoard(board: MarketBoard): Promise<MarketEntry[]> {
    const path = BOARD_PATHS[board];
    if (!path) throw invalid(`Unknown marketplace board: ${board}`);
    const response = await request(`${MARKETPLACE_URL}${path}`, "text/html");
    const entries = parseBoardHtml(await response.text());
    if (entries.length === 0) {
      // An empty board means the page changed shape, not that the marketplace is empty.
      throw new AppError("NETWORK", `The ${MARKETPLACE_NAME} listing could not be read`);
    }
    return entries;
  }

  const api: MarketApi = {
    board: async (board, provider: MarketProvider = "skills_sh") => {
      if (provider === "clawhub") {
        return clawhubListing(
          `${CLAWHUB_CACHE_PREFIX}${BOARD_CACHE_PREFIX}${board}`,
          BOARD_CACHE_TTL_MS,
          () => clawhub.list(board),
          "board",
        );
      }
      if (!(board in BOARD_PATHS)) throw invalid(`Unknown marketplace board: ${board}`);
      const key = `${BOARD_CACHE_PREFIX}${board}`;
      const cached = readCache(key);
      if (cached?.fresh) return live(cached.entries);
      try {
        const entries = await fetchBoard(board);
        writeCache(key, entries);
        return live(entries);
      } catch (error) {
        return orCached(error, cached, "board");
      }
    },

    search: async (query, limit = MARKET_SEARCH_DEFAULT_LIMIT, provider = "skills_sh") => {
      const q = query.trim();
      if (!q) return { skills: [], cachedAt: null };
      const capped = Math.min(
        Math.max(Math.floor(limit) || MARKET_SEARCH_DEFAULT_LIMIT, 1),
        MAX_SEARCH_LIMIT,
      );
      if (provider === "clawhub") {
        const listing = await clawhubListing(
          `${CLAWHUB_CACHE_PREFIX}${SEARCH_CACHE_PREFIX}${capped}:${q.toLowerCase()}`,
          BOARD_CACHE_TTL_MS,
          () => clawhub.search(q, capped),
          "search",
        );
        pruneSearches();
        return listing;
      }
      const url = `${MARKETPLACE_URL}${SEARCH_PATH}?q=${encodeURIComponent(q)}&limit=${capped}`;
      const key = `${SEARCH_CACHE_PREFIX}${capped}:${q.toLowerCase()}`;
      try {
        const response = await request(url, "application/json");
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          throw new AppError("NETWORK", `The ${MARKETPLACE_NAME} search answer could not be read`);
        }
        const entries = parseSearchResponse(body).slice(0, capped);
        writeCache(key, entries);
        pruneSearches();
        return live(entries);
      } catch (error) {
        return orCached(error, readCache(key), "search");
      }
    },

    detail: async (source, skillId, provider = "skills_sh") => {
      if (provider === "clawhub") {
        const key = `${CLAWHUB_CACHE_PREFIX}${DETAIL_CACHE_PREFIX}${source.trim()}/${skillId.trim()}`;
        const cached = readCache<MarketSkillDetail>(key, DETAIL_CACHE_TTL_MS);
        if (cached?.fresh) return cached.entries;
        const found = await clawhub.detail(source.trim() || null, skillId.trim());
        const audits = await clawhub.audits(found.owner, found.slug);
        const detail: MarketSkillDetail = { ...found, audits };
        if (audits !== null && detail.document !== null) writeCache(key, detail);
        return detail;
      }
      const key = `${DETAIL_CACHE_PREFIX}${source.trim()}/${skillId.trim()}`;
      const cached = readCache<MarketSkillDetail>(key, DETAIL_CACHE_TTL_MS);
      if (cached?.fresh) return cached.entries;
      const detail = await fetchDetail(source, skillId);
      // A half answer (offline, rate limited) is shown but not kept, so the next look tries again.
      if (detail.audits !== null && detail.document !== null) writeCache(key, detail);
      return detail;
    },
  };

  return { api, clawhub };
}
