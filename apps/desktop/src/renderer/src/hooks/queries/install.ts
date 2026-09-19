import type { MarketBoard, MarketSkill, ScanResult } from "@skillboard/shared";
import { type UseQueryResult, keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** One marketplace leaderboard. The backend caches boards, so switching back is instant. */
export function useMarketBoard(board: MarketBoard, enabled = true): UseQueryResult<MarketSkill[]> {
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
export function useMarketSearch(query: string, limit: number): UseQueryResult<MarketSkill[]> {
  const trimmed = query.trim();
  return useQuery({
    queryKey: [...keys.market.search(trimmed), limit],
    queryFn: () => api.market.search(trimmed, limit),
    enabled: trimmed.length > 0,
    placeholderData: keepPreviousData,
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
