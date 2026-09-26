import type { SafetyRecord, SafetyStatus } from "@loadout/shared";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";

/** Whether the scanner is installed, which one, and whether installs are checked. */
export function useSafetyStatus(): UseQueryResult<SafetyStatus> {
  return useQuery({ queryKey: keys.safety.status, queryFn: () => api.safety.status() });
}

/** The last safety report of every library skill that has one, by skill id. */
export function useSafetyReports(): ReadonlyMap<string, SafetyRecord> {
  const { data } = useQuery({ queryKey: keys.safety.list, queryFn: () => api.safety.list() });
  return useMemo(() => new Map((data ?? []).map((record) => [record.skillId, record])), [data]);
}
