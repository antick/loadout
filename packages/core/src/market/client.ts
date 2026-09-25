import {
  APP_SLUG,
  MARKETPLACE_NAME,
  MARKETPLACE_URL,
  type MarketApi,
  type MarketBoard,
  type MarketSkill,
  type MarketSkillDetail,
} from "@loadout/shared";
import type { CoreContext } from "../context";
import { AppError, errorMessage, invalid, isAppError } from "../errors";
import { createDownload } from "../install/download";
import type { SkillStore } from "../skills/store";
import { createMarketDetail } from "./detail";
import { type MarketEntry, parseBoardHtml, parseSearchResponse } from "./parse";

export interface MarketServiceDeps {
  store: SkillStore;
  /**
   * HTTP client. The built-in `fetch` ignores the proxy setting, so the desktop app injects a
   * proxy-aware one; tests inject a fake.
   */
  fetchImpl?: typeof fetch;
}

export interface MarketService {
  api: MarketApi;
}

const BOARD_PATHS: Record<MarketBoard, string> = {
  hot: "/hot",
  trending: "/trending",
  all_time: "/",
};
const SEARCH_PATH = "/api/search";
const REQUEST_TIMEOUT_MS = 15_000;
const BOARD_CACHE_TTL_MS = 300_000;
const BOARD_CACHE_PREFIX = "board:";
const DETAIL_CACHE_PREFIX = "detail:";
/** Audits and documents change far less often than rankings. */
const DETAIL_CACHE_TTL_MS = 1_800_000;
const DEFAULT_SEARCH_LIMIT = 50;
const MAX_SEARCH_LIMIT = 200;

interface CacheRow {
  data: string;
  fetched_at: number;
}

export function createMarketService(ctx: CoreContext, deps: MarketServiceDeps): MarketService {
  const { store } = deps;
  const fetchDetail = createMarketDetail({ download: createDownload(deps.fetchImpl) });

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
  ): { entries: T; fresh: boolean } | null {
    const row = ctx.db.get<CacheRow>(
      "SELECT data, fetched_at FROM market_cache WHERE cache_key = ?",
      key,
    );
    if (!row) return null;
    try {
      const entries = JSON.parse(row.data) as T;
      return { entries, fresh: Date.now() - row.fetched_at < ttlMs };
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

  /** `installed` is worked out on every call, never cached: the library changes under the cache. */
  function withInstalled(entries: MarketEntry[]): MarketSkill[] {
    const installed = new Set(
      store
        .list()
        .flatMap((s) => (s.sourceType === "marketplace" && s.sourceRef ? [s.sourceRef] : [])),
    );
    return entries.map((entry) => {
      const id = `${entry.source}/${entry.skillId}`;
      return { id, ...entry, installed: installed.has(id) };
    });
  }

  async function fetchBoard(board: MarketBoard): Promise<MarketEntry[]> {
    const response = await request(`${MARKETPLACE_URL}${BOARD_PATHS[board]}`, "text/html");
    const entries = parseBoardHtml(await response.text());
    if (entries.length === 0) {
      // An empty board means the page changed shape, not that the marketplace is empty.
      throw new AppError("NETWORK", `The ${MARKETPLACE_NAME} listing could not be read`);
    }
    return entries;
  }

  const api: MarketApi = {
    board: async (board) => {
      if (!(board in BOARD_PATHS)) throw invalid(`Unknown marketplace board: ${board}`);
      const key = `${BOARD_CACHE_PREFIX}${board}`;
      const cached = readCache(key);
      if (cached?.fresh) return withInstalled(cached.entries);
      try {
        const entries = await fetchBoard(board);
        writeCache(key, entries);
        return withInstalled(entries);
      } catch (error) {
        // Offline with an old listing beats an error page.
        if (!cached || !isAppError(error)) throw error;
        ctx.log.warn(`Showing a cached ${MARKETPLACE_NAME} board`, error);
        return withInstalled(cached.entries);
      }
    },

    search: async (query, limit = DEFAULT_SEARCH_LIMIT) => {
      const q = query.trim();
      if (!q) return [];
      const capped = Math.min(
        Math.max(Math.floor(limit) || DEFAULT_SEARCH_LIMIT, 1),
        MAX_SEARCH_LIMIT,
      );
      const url = `${MARKETPLACE_URL}${SEARCH_PATH}?q=${encodeURIComponent(q)}&limit=${capped}`;
      const response = await request(url, "application/json");
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new AppError("NETWORK", `The ${MARKETPLACE_NAME} search answer could not be read`);
      }
      return withInstalled(parseSearchResponse(body).slice(0, capped));
    },

    detail: async (source, skillId) => {
      const key = `${DETAIL_CACHE_PREFIX}${source.trim()}/${skillId.trim()}`;
      const cached = readCache<MarketSkillDetail>(key, DETAIL_CACHE_TTL_MS);
      if (cached?.fresh) return cached.entries;
      const detail = await fetchDetail(source, skillId);
      // A half answer (offline, rate limited) is shown but not kept, so the next look tries again.
      if (detail.audits !== null && detail.document !== null) writeCache(key, detail);
      return detail;
    },
  };

  return { api };
}
