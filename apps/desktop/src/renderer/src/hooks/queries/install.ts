import type {
  MarketBoard,
  MarketListing,
  MarketSkill,
  MarketSkillDetail,
  ScanResult,
} from "@loadout/shared";
import { type UseQueryResult, keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** One marketplace leaderboard. The backend caches boards, so switching back is instant. */
export function useMarketBoard(board: MarketBoard, enabled = true): UseQueryResult<MarketListing> {
  return useQuery({
    queryKey: keys.market.board(board),
    queryFn: () => api.market.board(board),
    enabled,
  });
}

/**
 * Marketplace keyword search. Raising `limit` refetches with more results while the current ones
 * stay on screen. Disabled for a blank query.
 */
export function useMarketSearch(query: string, limit: number): UseQueryResult<MarketListing> {
  const trimmed = query.trim();
  return useQuery({
    queryKey: [...keys.market.search(trimmed), limit],
    queryFn: () => api.market.search(trimmed, limit),
    enabled: trimmed.length > 0,
    placeholderData: keepPreviousData,
  });
}

/** How long a skill's audits and document count as fresh; the backend caches them longer. */
const MARKET_DETAIL_STALE_MS = 300_000;

/** Audits and SKILL.md of one marketplace skill, for its detail sheet. */
export function useMarketDetail(
  skill: Pick<MarketSkill, "id" | "source" | "skillId">,
): UseQueryResult<MarketSkillDetail> {
  return useQuery({
    queryKey: keys.market.detail(skill.id),
    queryFn: () => api.market.detail(skill.source, skill.skillId),
    staleTime: MARKET_DETAIL_STALE_MS,
  });
}

/**
 * Skills sitting in agent folders that the library does not manage yet. Scanning walks the disk,
 * so it runs when the Scan tab opens (`enabled`) and on Rescan, not on window focus.
 */
export function useScanLocal(enabled = true): UseQueryResult<ScanResult> {
  return useQuery({
    queryKey: keys.install.scan,
    queryFn: () => api.install.scanLocal(),
    enabled,
    refetchOnWindowFocus: false,
  });
}
